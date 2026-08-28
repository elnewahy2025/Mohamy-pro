import * as client from 'openid-client';
import {
  OidcConfigurationError,
  OidcProviderUnavailableError,
  OidcTokenValidationError,
} from '../auth.errors';
import { OidcProviderService } from './oidc-provider.service';

jest.mock('openid-client', () => ({
  discovery: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  randomState: jest.fn(),
  randomNonce: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  refreshTokenGrant: jest.fn(),
  tokenRevocation: jest.fn(),
  AuthorizationResponseError: class extends Error {},
  ResponseBodyError: class extends Error {},
}));

const mocked = client as jest.Mocked<typeof client>;

const config = {
  OIDC_ISSUER: 'https://issuer.example/oidc',
  OIDC_CLIENT_ID: 'client-id',
  OIDC_CLIENT_SECRET: 'client-secret',
  OIDC_REDIRECT_URI: 'http://localhost/callback',
  OIDC_SCOPE: 'openid profile email',
};

function configServiceMock() {
  return {
    getOrThrow: jest.fn(() => undefined),
    get: jest.fn(
      (key: string) => (config as Record<string, unknown>)[key] ?? undefined,
    ),
  };
}

function metadataMock(overrides: Record<string, unknown> = {}) {
  return {
    issuer: new URL('https://issuer.example/oidc'),
    jwks_uri: new URL('https://issuer.example/oidc/jwks'),
    authorization_endpoint: new URL('https://issuer.example/oidc/auth'),
    token_endpoint: new URL('https://issuer.example/oidc/token'),
    userinfo_endpoint: new URL('https://issuer.example/oidc/me'),
    revocation_endpoint: new URL('https://issuer.example/oidc/revoke'),
    end_session_endpoint: new URL('https://issuer.example/oidc/session/end'),
    ...overrides,
  } as any;
}

describe('OidcProviderService', () => {
  let service: OidcProviderService;
  let configService: ReturnType<typeof configServiceMock>;

  const configure = async (
    metadata = metadataMock(),
    discoveryImpl?: (...args: unknown[]) => unknown,
  ) => {
    configService = configServiceMock();
    service = new OidcProviderService(configService as any);
    const discovered = { serverMetadata: () => metadata };
    mocked.discovery.mockResolvedValue(discoveryImpl ?? discovered);
    await service.onModuleInit();
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fails configuration when OIDC_ISSUER is missing', async () => {
    configService = configServiceMock();
    configService.get.mockImplementation((key: string) =>
      key === 'OIDC_ISSUER' ? undefined : (config as any)[key],
    );
    service = new OidcProviderService(configService as any);
    await expect(service.onModuleInit()).rejects.toThrow(
      OidcConfigurationError,
    );
  });

  it('fails configuration when client credentials are missing', async () => {
    configService = configServiceMock();
    configService.get.mockImplementation((key: string) =>
      key === 'OIDC_CLIENT_ID' ? undefined : (config as any)[key],
    );
    service = new OidcProviderService(configService as any);
    await expect(service.onModuleInit()).rejects.toThrow(
      OidcConfigurationError,
    );
  });

  it('wraps discovery failures', async () => {
    configService = configServiceMock();
    service = new OidcProviderService(configService as any);
    mocked.discovery.mockRejectedValue(new Error('network down'));
    await expect(service.onModuleInit()).rejects.toThrow(
      OidcProviderUnavailableError,
    );
  });

  it('discovers the provider and builds an authorization url with PKCE', async () => {
    await configure();
    mocked.randomPKCECodeVerifier.mockReturnValue('verifier');
    mocked.calculatePKCECodeChallenge.mockResolvedValue('challenge');
    mocked.randomState.mockReturnValue('state-1');
    mocked.randomNonce.mockReturnValue('nonce-1');
    mocked.buildAuthorizationUrl.mockImplementation(
      (_cfg: unknown, params: Record<string, string>) => ({
        href: `https://issuer/auth?state=${params.state}&scope=${params.scope}`,
      }),
    );
    mocked.discovery.mockResolvedValueOnce({
      serverMetadata: () => metadataMock(),
    });

    const result = await service.buildAuthorizationUrl();

    expect(result.state).toBe('state-1');
    expect(result.nonce).toBe('nonce-1');
    expect(result.codeVerifier).toBe('verifier');
    expect(mocked.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        response_type: 'code',
        code_challenge_method: 'S256',
        redirect_uri: config.OIDC_REDIRECT_URI,
        scope: config.OIDC_SCOPE,
      }),
    );
  });

  it('exchanges a code and derives the profile from the id token', async () => {
    await configure();
    const b64url = (obj: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    const idToken = [
      b64url({ alg: 'none', typ: 'JWT' }),
      b64url({ sub: 'sub-1', email: 'a@b.c' }),
      'signature',
    ].join('.');
    mocked.authorizationCodeGrant.mockResolvedValue({
      access_token: 'access',
      id_token: idToken,
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    const { tokens, profile } = await service.exchangeCode(
      new URL('http://localhost/callback?code=c&state=s'),
      'verifier',
      'state-1',
      'nonce-1',
    );

    expect(tokens.refreshToken).toBe('refresh');
    expect(profile.subject).toBe('sub-1');
    expect(profile.email).toBe('a@b.c');
    expect(mocked.authorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(URL),
      expect.objectContaining({
        pkceCodeVerifier: 'verifier',
        expectedState: 'state-1',
        expectedNonce: 'nonce-1',
      }),
      expect.objectContaining({ redirect_uri: config.OIDC_REDIRECT_URI }),
    );
  });

  it('throws OidcTokenValidationError when the exchange fails', async () => {
    await configure();
    mocked.authorizationCodeGrant.mockRejectedValue(new Error('bad code'));
    await expect(
      service.exchangeCode(
        new URL('http://localhost/callback?code=c'),
        'verifier',
        's',
        'n',
      ),
    ).rejects.toThrow(OidcTokenValidationError);
  });

  it('refreshes tokens', async () => {
    await configure();
    mocked.refreshTokenGrant.mockResolvedValue({ access_token: 'a2' });
    const tokens = await service.refresh('refresh-old');
    expect(tokens.accessToken).toBe('a2');
  });

  it('revokes a refresh token through the provider endpoint', async () => {
    await configure();
    await service.revoke('refresh-old');
    expect(mocked.tokenRevocation).toHaveBeenCalledWith(
      expect.anything(),
      'refresh-old',
      expect.objectContaining({ token_type_hint: 'refresh_token' }),
    );
  });

  it('skips revocation when no endpoint is advertised', async () => {
    service = new OidcProviderService(configServiceMock() as any);
    mocked.discovery.mockResolvedValue({
      serverMetadata: () => metadataMock({ revocation_endpoint: undefined }),
    });
    await service.onModuleInit();
    await expect(service.revoke('refresh-old')).resolves.toBeUndefined();
    expect(mocked.tokenRevocation).not.toHaveBeenCalled();
  });

  it('builds a logout url from the end-session endpoint', async () => {
    await configure();
    expect(service.buildLogoutUrl()).toBe(
      'https://issuer.example/oidc/session/end',
    );
  });
});

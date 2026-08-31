import { ConfigService } from '@nestjs/config';
import * as client from 'openid-client';
import type { ValidatedEnvironment } from '../../config/env.validation';
import {
  OidcConfigurationError,
  OidcProviderUnavailableError,
  OidcTokenValidationError,
} from '../auth.errors';
import { OidcProviderService } from './oidc-provider.service';

const SERVER_METADATA = {
  issuer: 'https://issuer.example/oidc',
  jwks_uri: 'https://issuer.example/oidc/jwks',
  authorization_endpoint: 'https://issuer.example/oidc/auth',
  token_endpoint: 'https://issuer.example/oidc/token',
  userinfo_endpoint: 'https://issuer.example/oidc/me',
  revocation_endpoint: 'https://issuer.example/oidc/revoke',
  end_session_endpoint: 'https://issuer.example/oidc/session/end',
} as const;

const CONFIG = {
  OIDC_ISSUER: 'https://issuer.example/oidc',
  OIDC_CLIENT_ID: 'client-id',
  OIDC_CLIENT_SECRET: 'client-secret',
  OIDC_REDIRECT_URI: 'http://localhost/callback',
  OIDC_SCOPE: 'openid profile email',
} as const;

function makeConfigService(
  values: Record<string, unknown> = CONFIG,
): ConfigService<ValidatedEnvironment, true> {
  return new ConfigService<ValidatedEnvironment, true>(values);
}

function makeConfiguration(
  overrides: Partial<typeof SERVER_METADATA> = {},
): client.Configuration {
  const metadata = { ...SERVER_METADATA, ...overrides };
  return new client.Configuration(
    metadata,
    CONFIG.OIDC_CLIENT_ID,
    CONFIG.OIDC_CLIENT_SECRET,
  );
}

function tokenResponse(
  overrides: {
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  },
): client.TokenEndpointResponse & client.TokenEndpointResponseHelpers {
  const base: client.TokenEndpointResponse = {
    access_token: overrides.accessToken ?? 'access',
    id_token: overrides.idToken,
    refresh_token: overrides.refreshToken,
    expires_in: overrides.expiresIn,
    token_type: 'bearer',
    scope: CONFIG.OIDC_SCOPE,
  };
  return Object.assign(base, {
    claims: () => undefined,
    expiresIn: () => overrides.expiresIn,
  });
}

describe('OidcProviderService', () => {
  let service: OidcProviderService;
  let configService: ConfigService<ValidatedEnvironment, true>;

  const configure = async (discoveryImpl?: Promise<client.Configuration>) => {
    configService = makeConfigService();
    service = new OidcProviderService(configService);
    jest
      .spyOn(client, 'discovery')
      .mockResolvedValue(discoveryImpl ?? makeConfiguration());
    await service.onModuleInit();
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('fails configuration when OIDC_ISSUER is missing', async () => {
    const values: Record<string, unknown> = { ...CONFIG };
    delete values.OIDC_ISSUER;
    configService = makeConfigService(values);
    service = new OidcProviderService(configService);
    await expect(service.onModuleInit()).rejects.toThrow(
      OidcConfigurationError,
    );
  });

  it('fails configuration when client credentials are missing', async () => {
    const values: Record<string, unknown> = { ...CONFIG };
    delete values.OIDC_CLIENT_ID;
    configService = makeConfigService(values);
    service = new OidcProviderService(configService);
    await expect(service.onModuleInit()).rejects.toThrow(
      OidcConfigurationError,
    );
  });

  it('wraps discovery failures', async () => {
    configService = makeConfigService();
    service = new OidcProviderService(configService);
    jest
      .spyOn(client, 'discovery')
      .mockRejectedValue(new Error('network down'));
    await expect(service.onModuleInit()).rejects.toThrow(
      OidcProviderUnavailableError,
    );
  });

  it('discovers the provider and builds an authorization url with PKCE', async () => {
    await configure();
    jest.spyOn(client, 'randomPKCECodeVerifier').mockReturnValue('verifier');
    jest
      .spyOn(client, 'calculatePKCECodeChallenge')
      .mockResolvedValue('challenge');
    jest.spyOn(client, 'randomState').mockReturnValue('state-1');
    jest.spyOn(client, 'randomNonce').mockReturnValue('nonce-1');
    const buildAuthorizationUrl = jest
      .spyOn(client, 'buildAuthorizationUrl')
      .mockImplementation(() =>
        new URL('https://issuer/auth?state=state-1&scope=openid'),
      );

    const result = await service.buildAuthorizationUrl();

    expect(result.state).toBe('state-1');
    expect(result.nonce).toBe('nonce-1');
    expect(result.codeVerifier).toBe('verifier');
    expect(buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        response_type: 'code',
        code_challenge_method: 'S256',
        redirect_uri: CONFIG.OIDC_REDIRECT_URI,
        scope: CONFIG.OIDC_SCOPE,
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
    jest.spyOn(client, 'authorizationCodeGrant').mockResolvedValue(
      tokenResponse({ idToken, refreshToken: 'refresh', expiresIn: 3600 }),
    );

    const { tokens, profile } = await service.exchangeCode(
      new URL('http://localhost/callback?code=c&state=s'),
      'verifier',
      'state-1',
      'nonce-1',
    );

    expect(tokens.refreshToken).toBe('refresh');
    expect(profile.subject).toBe('sub-1');
    expect(profile.email).toBe('a@b.c');
    expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(URL),
      expect.objectContaining({
        pkceCodeVerifier: 'verifier',
        expectedState: 'state-1',
        expectedNonce: 'nonce-1',
      }),
      expect.objectContaining({ redirect_uri: CONFIG.OIDC_REDIRECT_URI }),
    );
  });

  it('throws OidcTokenValidationError when the exchange fails', async () => {
    await configure();
    jest
      .spyOn(client, 'authorizationCodeGrant')
      .mockRejectedValue(new Error('bad code'));
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
    jest
      .spyOn(client, 'refreshTokenGrant')
      .mockResolvedValue(tokenResponse({ accessToken: 'a2', expiresIn: 300 }));
    const tokens = await service.refresh('refresh-old');
    expect(tokens.accessToken).toBe('a2');
  });

  it('revokes a refresh token through the provider endpoint', async () => {
    await configure();
    const tokenRevocation = jest
      .spyOn(client, 'tokenRevocation')
      .mockResolvedValue(undefined);
    await service.revoke('refresh-old');
    expect(tokenRevocation).toHaveBeenCalledWith(
      expect.anything(),
      'refresh-old',
      expect.objectContaining({ token_type_hint: 'refresh_token' }),
    );
  });

  it('skips revocation when no endpoint is advertised', async () => {
    configService = makeConfigService();
    service = new OidcProviderService(configService);
    jest.spyOn(client, 'discovery').mockResolvedValue(
      makeConfiguration({ revocation_endpoint: undefined }),
    );
    await service.onModuleInit();
    const tokenRevocation = jest.spyOn(client, 'tokenRevocation');
    await expect(service.revoke('refresh-old')).resolves.toBeUndefined();
    expect(tokenRevocation).not.toHaveBeenCalled();
  });

  it('builds a logout url from the end-session endpoint', async () => {
    await configure();
    expect(service.buildLogoutUrl()).toBe(
      'https://issuer.example/oidc/session/end',
    );
  });
});

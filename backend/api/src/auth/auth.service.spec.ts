import { AuthService } from './auth.service';

function config() {
  return {
    getOrThrow: jest
      .fn()
      .mockReturnValue('http://127.0.0.1:3000/api/v1/auth/callback'),
  } as never;
}

describe('AuthService', () => {
  it('creates a PKCE transaction and normalizes an unsafe return path', async () => {
    const saved: Record<string, unknown>[] = [];
    const oidc = {
      buildAuthorizationUrl: jest.fn(() => 'http://issuer.invalid/auth'),
    } as never;
    const transactions = {
      save: jest.fn((value: Record<string, unknown>) => {
        saved.push(value);
      }),
    } as never;
    const sessions = {} as never;
    const service = new AuthService(oidc, transactions, sessions, config());

    await expect(service.startLogin('https://attacker.invalid')).resolves.toBe(
      'http://issuer.invalid/auth',
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].returnTo).toBe('/en');
    expect(saved[0].state).toEqual(
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    expect(saved[0].nonce).toEqual(
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    expect(saved[0].codeVerifier).toEqual(
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
  });

  it('rejects missing or replayed callback state before token exchange', async () => {
    const oidc = { exchangeCode: jest.fn() } as never;
    const transactions = { consume: jest.fn(() => null) } as never;
    const service = new AuthService(oidc, transactions, {} as never, config());

    await expect(service.completeLogin({ code: 'code' })).rejects.toThrow(
      'AUTHENTICATION_FAILED',
    );
    await expect(
      service.completeLogin({ code: 'code', state: 'A'.repeat(43) }),
    ).rejects.toThrow('AUTHENTICATION_FAILED');
    expect(oidc.exchangeCode).not.toHaveBeenCalled();
  });

  it('classifies access-token audience failures without logging the native message', async () => {
    const transaction = {
      state: 'A'.repeat(43),
      nonce: 'B'.repeat(43),
      codeVerifier: 'C'.repeat(64),
      redirectUri: 'http://127.0.0.1:3000/api/v1/auth/callback',
      returnTo: '/en',
      createdAt: Date.now(),
    };
    const oidc = {
      exchangeCode: jest.fn(() => ({
        access_token: 'access',
        token_type: 'Bearer',
        id_token: 'id',
        refresh_token: 'refresh',
      })),
      verifyIdToken: jest.fn(() => ({
        iss: 'issuer',
        sub: 'subject',
        aud: 'audience',
        exp: 1,
        iat: 1,
        nonce: transaction.nonce,
      })),
      verifyAccessToken: jest.fn(() => {
        throw new Error('unexpected "aud" claim value');
      }),
    } as never;
    const transactions = { consume: jest.fn(() => transaction) } as never;
    const service = new AuthService(oidc, transactions, {} as never, config());
    const warn = jest.fn();
    (service as unknown as { logger: { warn: jest.Mock } }).logger = { warn };

    await expect(
      service.completeLogin({ code: 'code', state: transaction.state }),
    ).rejects.toThrow('AUTHENTICATION_FAILED');
    expect(warn).toHaveBeenCalledWith(
      'OIDC callback rejected during access_token_validation|reason=audience_mismatch|error=Error',
    );
  });

  it('classifies jose error codes without exposing native validation text', async () => {
    const transaction = {
      state: 'A'.repeat(43),
      nonce: 'B'.repeat(43),
      codeVerifier: 'C'.repeat(64),
      redirectUri: 'http://127.0.0.1:3000/api/v1/auth/callback',
      returnTo: '/en',
      createdAt: Date.now(),
    };
    const oidc = {
      exchangeCode: jest.fn(() => ({
        access_token: 'access',
        token_type: 'Bearer',
        id_token: 'id',
        refresh_token: 'refresh',
      })),
      verifyIdToken: jest.fn(() => ({
        iss: 'issuer',
        sub: 'subject',
        aud: 'audience',
        exp: 1,
        iat: 1,
        nonce: transaction.nonce,
      })),
      verifyAccessToken: jest.fn(() => {
        const error = new Error(
          'native jose detail must not be logged',
        ) as Error & {
          code: string;
          claim: string;
        };
        error.code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
        error.claim = 'aud';
        throw error;
      }),
    } as never;
    const transactions = { consume: jest.fn(() => transaction) } as never;
    const service = new AuthService(oidc, transactions, {} as never, config());
    const warn = jest.fn();
    (service as unknown as { logger: { warn: jest.Mock } }).logger = { warn };

    await expect(
      service.completeLogin({ code: 'code', state: transaction.state }),
    ).rejects.toThrow('AUTHENTICATION_FAILED');
    expect(warn).toHaveBeenCalledWith(
      'OIDC callback rejected during access_token_validation|reason=audience_mismatch|error=Error',
    );
  });

  it('requires ID and access tokens to identify the same subject', async () => {
    const transaction = {
      state: 'A'.repeat(43),
      nonce: 'B'.repeat(43),
      codeVerifier: 'C'.repeat(64),
      redirectUri: 'http://127.0.0.1:3000/api/v1/auth/callback',
      returnTo: '/en',
      createdAt: Date.now(),
    };
    const oidc = {
      exchangeCode: jest.fn(() => ({
        access_token: 'access',
        token_type: 'Bearer',
        id_token: 'id',
        refresh_token: 'refresh',
      })),
      verifyIdToken: jest.fn(() => ({
        iss: 'issuer',
        sub: 'subject-a',
        aud: 'audience',
        exp: 1,
        iat: 1,
        nonce: transaction.nonce,
      })),
      verifyAccessToken: jest.fn(() => ({
        iss: 'issuer',
        sub: 'subject-b',
        aud: 'audience',
        exp: 1,
        iat: 1,
      })),
    } as never;
    const transactions = { consume: jest.fn(() => transaction) } as never;
    const sessions = { createFromOidc: jest.fn() } as never;
    const service = new AuthService(oidc, transactions, sessions, config());

    await expect(
      service.completeLogin({ code: 'code', state: transaction.state }),
    ).rejects.toThrow('AUTHENTICATION_FAILED');
    expect(sessions.createFromOidc).not.toHaveBeenCalled();
  });
});

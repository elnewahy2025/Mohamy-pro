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

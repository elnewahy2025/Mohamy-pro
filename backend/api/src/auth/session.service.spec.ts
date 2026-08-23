import { SessionService } from './session.service';

const COOKIE = 'A'.repeat(43);
const TOKEN_HASH = `hash:${COOKIE}`;
const OLD_REFRESH_TOKEN = 'refresh-token-1';
const NEW_REFRESH_TOKEN = 'refresh-token-2';
const anyDateMatcher: unknown = expect.any(Date);

function createConfig() {
  return {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        SESSION_IDLE_TTL_SECONDS: 1_800,
        SESSION_ABSOLUTE_TTL_SECONDS: 43_200,
      };
      return values[key];
    }),
  } as never;
}

function createCrypto() {
  return {
    hash: jest.fn((value: string) => `hash:${value}`),
    decrypt: jest.fn(() => OLD_REFRESH_TOKEN),
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
  } as never;
}

function createSession() {
  return {
    id: 'session-id',
    status: 'ACTIVE',
    tokenHash: TOKEN_HASH,
    providerRefreshTokenCiphertext: 'encrypted:refresh-token-1',
    csrfTokenCiphertext: 'encrypted:csrf-token',
    user: { status: 'ACTIVE' },
  };
}

function createPrisma(updateMany: jest.Mock) {
  const transaction = {
    appSession: {
      findUnique: jest.fn().mockResolvedValue(createSession()),
      updateMany,
    },
  };
  return {
    withGlobalOperationContext: jest.fn(
      (_operationId: string, callback: (value: never) => unknown) =>
        callback(transaction as never),
    ),
  } as never;
}

describe('SessionService refresh lifecycle', () => {
  it('atomically replaces the encrypted refresh token when the provider rotates it', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const oidc = {
      refreshToken: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        token_type: 'Bearer',
        refresh_token: NEW_REFRESH_TOKEN,
      }),
    } as never;
    const crypto = createCrypto();
    const service = new SessionService(
      createPrisma(updateMany),
      crypto,
      oidc,
      createConfig(),
    );

    await expect(service.refreshByCookie(COOKIE)).resolves.toBe(true);

    expect(oidc.refreshToken).toHaveBeenCalledWith(OLD_REFRESH_TOKEN);
    expect(crypto.encrypt).toHaveBeenCalledWith(NEW_REFRESH_TOKEN);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'session-id', status: 'ACTIVE', tokenHash: TOKEN_HASH },
      data: {
        providerRefreshTokenCiphertext: `encrypted:${NEW_REFRESH_TOKEN}`,
        lastUsedAt: anyDateMatcher,
      },
    });
  });

  it('retains the encrypted token when the provider omits a replacement token', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const oidc = {
      refreshToken: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        token_type: 'Bearer',
      }),
    } as never;
    const crypto = createCrypto();
    const service = new SessionService(
      createPrisma(updateMany),
      crypto,
      oidc,
      createConfig(),
    );

    await expect(service.refreshByCookie(COOKIE)).resolves.toBe(true);

    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'session-id', status: 'ACTIVE', tokenHash: TOKEN_HASH },
      data: {
        providerRefreshTokenCiphertext: 'encrypted:refresh-token-1',
        lastUsedAt: anyDateMatcher,
      },
    });
  });

  it('revokes the application session when provider refresh fails', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const oidc = {
      refreshToken: jest.fn().mockRejectedValue(new Error('provider failure')),
    } as never;
    const service = new SessionService(
      createPrisma(updateMany),
      createCrypto(),
      oidc,
      createConfig(),
    );

    await expect(service.refreshByCookie(COOKIE)).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'session-id', status: 'ACTIVE', tokenHash: TOKEN_HASH },
      data: {
        status: 'REVOKED',
        revokedAt: anyDateMatcher,
        revokedReason: 'provider_refresh_failed',
        providerRefreshTokenCiphertext: null,
        csrfTokenCiphertext: null,
      },
    });
  });

  it('fails closed when the atomic refresh update no longer matches the active session', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const oidc = {
      refreshToken: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        token_type: 'Bearer',
        refresh_token: NEW_REFRESH_TOKEN,
      }),
    } as never;
    const service = new SessionService(
      createPrisma(updateMany),
      createCrypto(),
      oidc,
      createConfig(),
    );

    await expect(service.refreshByCookie(COOKIE)).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: 'session-id', status: 'ACTIVE', tokenHash: TOKEN_HASH },
      data: {
        status: 'REVOKED',
        revokedAt: anyDateMatcher,
        revokedReason: 'provider_refresh_failed',
        providerRefreshTokenCiphertext: null,
        csrfTokenCiphertext: null,
      },
    });
  });
});

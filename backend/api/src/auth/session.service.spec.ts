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

function createSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-id',
    status: 'ACTIVE',
    tokenHash: TOKEN_HASH,
    userId: 'user-id',
    providerRefreshTokenCiphertext: 'encrypted:refresh-token-1',
    csrfTokenCiphertext: 'encrypted:csrf-token',
    idleExpiresAt: new Date(Date.now() + 3_600_000),
    absoluteExpiresAt: new Date(Date.now() + 7_200_000),
    user: { status: 'ACTIVE' },
    ...overrides,
  };
}

function createPrisma(
  updateMany: jest.Mock,
  session = createSession(),
  userUpdate: jest.Mock = jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
) {
  const transaction = {
    appSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      updateMany,
    },
    user: {
      update: userUpdate,
    },
  };
  return {
    withGlobalOperationContext: jest.fn(
      (_operationId: string, callback: (value: never) => unknown) =>
        callback(transaction as never),
    ),
  } as never;
}

describe('SessionService user-state lifecycle', () => {
  it('does not revoke sessions when transitioning to an allowed state', async () => {
    const updateMany = jest.fn();
    const userUpdate = jest.fn().mockResolvedValue({ status: 'PENDING' });
    const service = new SessionService(
      createPrisma(updateMany, createSession(), userUpdate),
      createCrypto(),
      {} as never,
      createConfig(),
    );

    await expect(
      service.transitionUserStatus('user-id', 'PENDING'),
    ).resolves.toEqual({ status: 'PENDING', revokedSessionCount: 0 });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { status: 'PENDING' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(['SUSPENDED', 'DISABLED', 'DELETED'] as const)(
    'atomically revokes every active session when transitioning to %s',
    async (status) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 3 });
      const userUpdate = jest.fn().mockResolvedValue({ status });
      const service = new SessionService(
        createPrisma(updateMany, createSession(), userUpdate),
        createCrypto(),
        {} as never,
        createConfig(),
      );

      await expect(
        service.transitionUserStatus('user-id', status),
      ).resolves.toEqual({ status, revokedSessionCount: 3 });

      expect(updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-id', status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: anyDateMatcher,
          revokedReason: 'account_status',
          providerRefreshTokenCiphertext: null,
          csrfTokenCiphertext: null,
        },
      });
    },
  );

  it.each(['SUSPENDED', 'DISABLED', 'DELETED'] as const)(
    'revokes all remaining active sessions when a %s user presents an existing cookie',
    async (status) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 2 });
      const service = new SessionService(
        createPrisma(
          updateMany,
          createSession({ user: { status }, userId: 'user-id' }),
        ),
        createCrypto(),
        {} as never,
        createConfig(),
      );

      await expect(service.findByCookie(COOKIE)).resolves.toBeNull();

      expect(updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-id', status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: anyDateMatcher,
          revokedReason: 'account_status',
          providerRefreshTokenCiphertext: null,
          csrfTokenCiphertext: null,
        },
      });
    },
  );

  it('revokes all remaining active sessions before refusing refresh for a blocked user', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const oidc = { refreshToken: jest.fn() };
    const service = new SessionService(
      createPrisma(
        updateMany,
        createSession({ user: { status: 'SUSPENDED' }, userId: 'user-id' }),
      ),
      createCrypto(),
      oidc as never,
      createConfig(),
    );

    await expect(service.refreshByCookie(COOKIE)).resolves.toBe(false);

    expect(oidc.refreshToken).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: anyDateMatcher,
        revokedReason: 'account_status',
        providerRefreshTokenCiphertext: null,
        csrfTokenCiphertext: null,
      },
    });
  });
});

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

  it.each([
    ['idle', { idleExpiresAt: new Date(0) }],
    ['absolute', { absoluteExpiresAt: new Date(0) }],
  ])(
    'rejects an expired %s session before provider refresh',
    async (_kind, expiry) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const oidc = {
        refreshToken: jest.fn(),
      } as never;
      const service = new SessionService(
        createPrisma(updateMany, createSession(expiry)),
        createCrypto(),
        oidc,
        createConfig(),
      );

      await expect(service.refreshByCookie(COOKIE)).resolves.toBe(false);

      expect(oidc.refreshToken).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'session-id', status: 'ACTIVE', tokenHash: TOKEN_HASH },
        data: {
          status: 'EXPIRED',
          revokedAt: anyDateMatcher,
          revokedReason: 'expired',
          providerRefreshTokenCiphertext: null,
          csrfTokenCiphertext: null,
        },
      });
    },
  );

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

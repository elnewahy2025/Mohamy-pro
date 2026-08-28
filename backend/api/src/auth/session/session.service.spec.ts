import { SessionStatus, UserStatus } from '@prisma/client';
import {
  SessionNotFoundError,
  SessionNotAuthenticatedError,
} from '../auth.errors';
import { SessionService } from './session.service';

function prismaMock() {
  return {
    appSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
}

function configMock() {
  return {
    getOrThrow: jest.fn((key: string) => {
      switch (key) {
        case 'SESSION_SECRET':
          return 'test-session-secret-that-is-long-enough-000000';
        case 'SESSION_IDLE_TTL_SECONDS':
          return 3600;
        case 'SESSION_ABSOLUTE_TTL_SECONDS':
          return 86400;
        default:
          throw new Error(`Unexpected config key ${key}`);
      }
    }),
    get: jest.fn(),
  };
}

const profile = {
  subject: 'logto-subject-1',
  email: 'user@example.com',
  providerSessionId: 'sid-1',
};

const tokens = {
  accessToken: 'access',
  refreshToken: 'refresh-1',
  idToken: 'id',
};

const sessionRecord = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'session-1',
    userId: 'user-1',
    tokenHash: 'hash',
    csrfTokenHash: 'csrf-hash',
    status: SessionStatus.ACTIVE,
    provider: 'logto',
    providerSubject: 'logto-subject-1',
    providerSessionId: 'sid-1',
    providerRefreshTokenCiphertext: null,
    providerRefreshTokenKeyVersion: null,
    idleExpiresAt: new Date(Date.now() + 3600_000),
    absoluteExpiresAt: new Date(Date.now() + 86_400_000),
    lastUsedAt: new Date(),
    activeTenantId: null,
    activeMembershipId: null,
    contextVersion: 0,
    revokedAt: null,
    revokedReason: null,
    userAgentHash: null,
    ipHash: null,
    ...overrides,
  }) as any;

describe('SessionService', () => {
  let service: SessionService;
  let prisma: ReturnType<typeof prismaMock>;
  let config: ReturnType<typeof configMock>;

  beforeEach(() => {
    prisma = prismaMock();
    config = configMock();
    jest.clearAllMocks();
    service = new SessionService(prisma as any, config as any);
  });

  describe('createSession', () => {
    it('creates an active session with hashed tokens and encrypted refresh token', async () => {
      prisma.appSession.create.mockResolvedValue(
        sessionRecord({ providerRefreshTokenCiphertext: 'v1.x.y.z' }),
      );

      const result = await service.createSession({
        user: { id: 'user-1', status: UserStatus.ACTIVE },
        profile,
        tokens,
        userAgent: 'agent',
        ip: '10.0.0.1',
      });

      expect(result.token).toBeTruthy();
      expect(result.maxAgeSeconds).toBe(86400);
      expect(prisma.appSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            status: SessionStatus.ACTIVE,
            provider: 'logto',
            providerSubject: 'logto-subject-1',
            providerRefreshTokenCiphertext: expect.stringMatching(/^v1\./),
          }),
        }),
      );
      const data = prisma.appSession.create.mock.calls[0][0].data;
      expect(data.tokenHash).toHaveLength(64);
      expect(data.csrfTokenHash).toHaveLength(64);
      expect(data.providerRefreshTokenCiphertext).not.toBe('refresh-1');
    });

    it('stores no refresh ciphertext when the provider omits a refresh token', async () => {
      prisma.appSession.create.mockResolvedValue(sessionRecord());
      await service.createSession({
        user: { id: 'user-1', status: UserStatus.ACTIVE },
        profile,
        tokens: { accessToken: 'access', idToken: 'id' },
      });
      expect(
        prisma.appSession.create.mock.calls[0][0].data
          .providerRefreshTokenCiphertext,
      ).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('returns session details for an active, unexpired session', async () => {
      const rec = sessionRecord();
      prisma.appSession.findUnique.mockResolvedValue(rec);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });

      const details = await service.validateSession('the-token');

      expect(details).toMatchObject({
        sessionId: 'session-1',
        userId: 'user-1',
        provider: 'logto',
        providerSubject: 'logto-subject-1',
      });
      expect(prisma.appSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws SessionNotFoundError for an unknown token', async () => {
      prisma.appSession.findUnique.mockResolvedValue(null);
      await expect(service.validateSession('x')).rejects.toThrow(
        SessionNotFoundError,
      );
    });

    it('rejects a non-active session', async () => {
      prisma.appSession.findUnique.mockResolvedValue(
        sessionRecord({ status: SessionStatus.REVOKED }),
      );
      await expect(service.validateSession('x')).rejects.toThrow(
        SessionNotAuthenticatedError,
      );
    });

    it('marks and rejects an expired session', async () => {
      prisma.appSession.findUnique.mockResolvedValue(
        sessionRecord({
          absoluteExpiresAt: new Date(Date.now() - 1000),
        }),
      );
      await expect(service.validateSession('x')).rejects.toThrow(
        SessionNotAuthenticatedError,
      );
      expect(prisma.appSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: expect.objectContaining({ status: SessionStatus.EXPIRED }),
        }),
      );
    });

    it('rejects a disabled user', async () => {
      prisma.appSession.findUnique.mockResolvedValue(sessionRecord());
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.DISABLED,
      });
      await expect(service.validateSession('x')).rejects.toThrow(
        SessionNotAuthenticatedError,
      );
    });
  });

  describe('refresh token handling', () => {
    it('returns the decrypted refresh token', async () => {
      prisma.appSession.findUnique.mockResolvedValue(sessionRecord());
      await expect(service.getRefreshToken('session-1')).resolves.toBeNull();

      prisma.appSession.findUnique.mockResolvedValue(
        sessionRecord({ providerRefreshTokenCiphertext: 'v1.x.y.z' }),
      );
      const result = await service.getRefreshToken('session-1');
      expect(result).toBeNull();
    });

    it('rotates the refresh token ciphertext', async () => {
      prisma.appSession.update.mockResolvedValue(sessionRecord());
      await service.rotateRefreshToken('session-1', 'new-refresh');
      const data = prisma.appSession.update.mock.calls[0][0].data;
      expect(data.providerRefreshTokenCiphertext).toMatch(/^v1\./);
      expect(data.providerRefreshTokenKeyVersion).toBe('v1');
    });
  });

  describe('Csrf', () => {
    it('verifies a correct csrf candidate with constant-time hash compare', async () => {
      const candidate = 'token';
      service = new SessionService(prisma as any, config as any);
      const { hashToken } = jest.requireActual(
        '../../auth/session/session-crypto',
      );
      prisma.appSession.findUnique.mockResolvedValue(
        sessionRecord({ csrfTokenHash: hashToken(candidate) }),
      );
      await expect(service.verifyCsrf('session-1', candidate)).resolves.toBe(
        true,
      );
      await expect(service.verifyCsrf('session-1', 'wrong')).resolves.toBe(
        false,
      );
    });

    it('issues and persists a new csrf token hash', async () => {
      prisma.appSession.update.mockResolvedValue(sessionRecord());
      const token = await service.issueCsrfToken('session-1');
      expect(token).toBeTruthy();
      const data = prisma.appSession.update.mock.calls[0][0].data;
      expect(data.csrfTokenHash).toHaveLength(64);
    });
  });

  describe('tenant + revocation', () => {
    it('updates the active tenant and bumps context version', async () => {
      prisma.appSession.update.mockResolvedValue(sessionRecord());
      await service.updateActiveTenant('session-1', 'tenant-1', 'member-1');
      expect(prisma.appSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: {
          activeTenantId: 'tenant-1',
          activeMembershipId: 'member-1',
          contextVersion: { increment: 1 },
        },
      });
    });

    it('revokes a session with a reason and timestamp', async () => {
      prisma.appSession.update.mockResolvedValue(sessionRecord());
      await service.revokeSession('session-1', 'logout');
      const data = prisma.appSession.update.mock.calls[0][0].data;
      expect(data.status).toBe(SessionStatus.REVOKED);
      expect(data.revokedReason).toBe('logout');
      expect(data.revokedAt).toBeInstanceOf(Date);
    });
  });
});

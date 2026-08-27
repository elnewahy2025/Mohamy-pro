import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import type { AuthenticatedSession } from './auth.types';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_USER_ID = '55555555-5555-4555-8555-555555555555';
const CORRELATION_ID = '66666666-6666-4666-8666-666666666666';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';
const ROLE_ID = '88888888-8888-4888-8888-888888888888';

function createSession(
  overrides: Partial<AuthenticatedSession> = {},
): AuthenticatedSession {
  return {
    sessionId: SESSION_ID,
    userId: TARGET_USER_ID,
    userStatus: 'PENDING',
    userLocale: 'en',
    providerSubject: 'provider-subject-target',
    emailNormalized: 'target@example.invalid',
    csrfTokenHash: 'csrf-hash',
    issuedAt: new Date('2026-08-26T10:00:00.000Z'),
    lastUsedAt: new Date('2026-08-26T10:00:00.000Z'),
    idleExpiresAt: new Date('2026-08-26T10:30:00.000Z'),
    absoluteExpiresAt: new Date('2026-08-26T22:00:00.000Z'),
    mfaVerifiedAt: null,
    mfaAcr: null,
    mfaAmr: [],
    activeMembershipCount: 0,
    activeTenantId: null,
    activeMembershipId: null,
    contextVersion: 0,
    ...overrides,
  };
}

function createFixture() {
  const transaction = {
    membership: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tenant: { findUnique: jest.fn() },
    role: { findMany: jest.fn() },
    organization: { count: jest.fn() },
    branch: { count: jest.fn() },
    department: { count: jest.fn() },
    team: { count: jest.fn() },
    invitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    membershipRole: { upsert: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([
      {
        acceptance_context_valid: true,
        acceptance_flag: true,
        presented_hash_matches: true,
        replacement_hash_matches: true,
        not_global_before_update: true,
      },
    ]),
  };
  const prisma = {
    withTenantContext: jest.fn((_context, callback) => callback(transaction)),
    withInvitationAcceptanceContext: jest.fn((_context, callback) =>
      callback(transaction),
    ),
    bindInvitationAcceptanceContext: jest.fn(),
    bindGlobalOperationContext: jest.fn(),
  };
  const audit = { recordInTransaction: jest.fn() };
  const redis = { getClient: jest.fn() };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'INVITATION_ACCEPTANCE_WINDOW_SECONDS') return 3600;
      if (key === 'INVITATION_ACCEPTANCE_MAX_ATTEMPTS') return 10;
      throw new Error(`unexpected config key: ${key}`);
    }),
  };
  return { transaction, prisma, audit, redis, config };
}

describe('InvitationService', () => {
  it('creates a hashed, one-time invitation and returns the token only at issuance', async () => {
    const fixture = createFixture();
    fixture.transaction.membership.findUnique.mockResolvedValue({
      userId: ACTOR_USER_ID,
      status: 'ACTIVE',
      activeFrom: null,
      activeUntil: null,
      tenant: { status: 'ACTIVE' },
    });
    fixture.transaction.tenant.findUnique.mockResolvedValue({
      status: 'ACTIVE',
    });
    fixture.transaction.role.findMany.mockResolvedValue([{ key: 'lawyer' }]);
    fixture.transaction.invitation.create.mockImplementation(({ data }) => ({
      id: data.id,
      expiresAt: data.expiresAt,
    }));
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    const result = await service.create({
      actorUserId: ACTOR_USER_ID,
      actorMembershipId: ACTOR_MEMBERSHIP_ID,
      tenantId: TENANT_ID,
      correlationId: CORRELATION_ID,
      intendedEmail: 'Target@Example.Invalid',
      requestedRoleKeys: ['lawyer'],
    });

    expect(result.invitationId).toBeDefined();
    expect(result.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fixture.transaction.invitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        intendedEmailNormalized: 'target@example.invalid',
        requestedRoleKeys: ['lawyer'],
        status: 'PENDING',
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    const stored = fixture.transaction.invitation.create.mock.calls[0][0].data;
    expect(stored.tokenHash).not.toBe(result.invitationToken);
    expect(fixture.audit.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'membership.invitation.created',
        metadata: { requestedRoleCount: 1, invitationStatus: 'PENDING' },
      }),
      fixture.transaction,
    );
  });

  it('rejects an invitation with two identity bindings before database access', async () => {
    const fixture = createFixture();
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.create({
        actorUserId: ACTOR_USER_ID,
        actorMembershipId: ACTOR_MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
        intendedEmail: 'target@example.invalid',
        intendedProviderSubject: 'provider-subject-target',
        requestedRoleKeys: ['lawyer'],
      }),
    ).rejects.toThrow('INVITATION_INVALID');
    expect(fixture.prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('rejects a wrong authenticated identity without mutating invitation or membership state', async () => {
    const fixture = createFixture();
    const token = 'a'.repeat(43);
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockResolvedValue(1),
    });
    fixture.transaction.invitation.findFirst.mockResolvedValue({
      id: INVITATION_ID,
      tenantId: TENANT_ID,
      inviterMembershipId: ACTOR_MEMBERSHIP_ID,
      intendedEmailNormalized: 'other@example.invalid',
      intendedProviderSubject: null,
      requestedRoleKeys: ['lawyer'],
      requestedScope: null,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token,
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toThrow('INVITATION_INVALID');
    expect(fixture.transaction.membership.create).not.toHaveBeenCalled();
    expect(fixture.transaction.membership.update).not.toHaveBeenCalled();
    expect(fixture.transaction.invitation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects unknown persisted scope keys before membership activation', async () => {
    const fixture = createFixture();
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockResolvedValue(1),
    });
    fixture.transaction.invitation.findFirst.mockResolvedValue({
      id: INVITATION_ID,
      tenantId: TENANT_ID,
      inviterMembershipId: ACTOR_MEMBERSHIP_ID,
      intendedEmailNormalized: 'target@example.invalid',
      intendedProviderSubject: null,
      requestedRoleKeys: ['lawyer', 7],
      requestedScope: null,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token: 'c'.repeat(43),
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toThrow('INVITATION_INVALID');
    expect(fixture.transaction.membership.create).not.toHaveBeenCalled();
  });

  it('fails closed when the acceptance limiter is unavailable', async () => {
    const fixture = createFixture();
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token: 'b'.repeat(43),
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(
      fixture.prisma.withInvitationAcceptanceContext,
    ).not.toHaveBeenCalled();
  });

  it('blocks the eleventh acceptance attempt for one token and source IP', async () => {
    const fixture = createFixture();
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockResolvedValue(11),
    });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token: 'c'.repeat(43),
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toThrow('INVITATION_RATE_LIMITED');
    expect(
      fixture.prisma.withInvitationAcceptanceContext,
    ).not.toHaveBeenCalled();
  });

  it('rejects a malformed stored role set without activating a membership', async () => {
    const fixture = createFixture();
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockResolvedValue(1),
    });
    fixture.transaction.invitation.findFirst.mockResolvedValue({
      id: INVITATION_ID,
      tenantId: TENANT_ID,
      inviterMembershipId: ACTOR_MEMBERSHIP_ID,
      intendedEmailNormalized: 'target@example.invalid',
      intendedProviderSubject: null,
      requestedRoleKeys: [],
      requestedScope: null,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token: 'd'.repeat(43),
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toThrow('INVITATION_INVALID');
    expect(fixture.transaction.membership.create).not.toHaveBeenCalled();
  });

  it('commits an expired admin revocation transition and audit before returning a controlled error', async () => {
    const fixture = createFixture();
    fixture.transaction.membership.findUnique.mockResolvedValue({
      userId: ACTOR_USER_ID,
      status: 'ACTIVE',
      activeFrom: null,
      activeUntil: null,
      tenant: { status: 'ACTIVE' },
    });
    fixture.transaction.tenant.findUnique.mockResolvedValue({
      status: 'ACTIVE',
    });
    fixture.transaction.invitation.findFirst.mockResolvedValue({
      id: INVITATION_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
    });
    fixture.transaction.invitation.updateMany.mockResolvedValue({ count: 1 });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.revoke({
        actorUserId: ACTOR_USER_ID,
        actorMembershipId: ACTOR_MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        invitationId: INVITATION_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow('INVITATION_NOT_ACTIONABLE');
    expect(fixture.transaction.invitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'EXPIRED', tokenHash: expect.any(String) },
      }),
    );
    expect(fixture.audit.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'membership.invitation.expired',
        metadata: { invitationStatus: 'EXPIRED' },
      }),
      fixture.transaction,
    );
  });

  it('commits an expired acceptance transition and audit before returning a controlled error', async () => {
    const fixture = createFixture();
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockResolvedValue(1),
    });
    fixture.transaction.invitation.findFirst.mockResolvedValue({
      id: INVITATION_ID,
      tenantId: TENANT_ID,
      inviterMembershipId: ACTOR_MEMBERSHIP_ID,
      intendedEmailNormalized: 'target@example.invalid',
      intendedProviderSubject: null,
      requestedRoleKeys: ['lawyer'],
      requestedScope: null,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
    });
    fixture.transaction.invitation.updateMany.mockResolvedValue({ count: 1 });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token: 'f'.repeat(43),
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toThrow('INVITATION_NOT_ACTIONABLE');
    expect(fixture.transaction.membership.create).not.toHaveBeenCalled();
    expect(fixture.transaction.invitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'EXPIRED', tokenHash: expect.any(String) },
      }),
    );
    expect(fixture.audit.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'membership.invitation.expired',
        policy: 'InvitationAcceptance',
      }),
      fixture.transaction,
    );
    expect(fixture.prisma.bindGlobalOperationContext).toHaveBeenCalledWith(
      fixture.transaction,
      expect.any(String),
    );
    expect(
      fixture.transaction.invitation.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      fixture.prisma.bindGlobalOperationContext.mock.invocationCallOrder[0],
    );
    expect(
      fixture.prisma.bindGlobalOperationContext.mock.invocationCallOrder[0],
    ).toBeLessThan(
      fixture.audit.recordInTransaction.mock.invocationCallOrder[0],
    );
  });

  it('does not audit when expiry terminalization loses its pending row', async () => {
    const fixture = createFixture();
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockResolvedValue(1),
    });
    fixture.transaction.invitation.findFirst.mockResolvedValue({
      id: INVITATION_ID,
      tenantId: TENANT_ID,
      inviterMembershipId: ACTOR_MEMBERSHIP_ID,
      intendedEmailNormalized: 'target@example.invalid',
      intendedProviderSubject: null,
      requestedRoleKeys: ['lawyer'],
      requestedScope: null,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
    });
    fixture.transaction.invitation.updateMany.mockResolvedValue({ count: 0 });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token: 'g'.repeat(43),
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toThrow('INVITATION_NOT_ACTIONABLE');
    expect(fixture.audit.recordInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a non-pending invitation state without changing persisted state', async () => {
    const fixture = createFixture();
    fixture.redis.getClient.mockReturnValue({
      eval: jest.fn().mockResolvedValue(1),
    });
    fixture.transaction.invitation.findFirst.mockResolvedValue({
      id: INVITATION_ID,
      tenantId: TENANT_ID,
      inviterMembershipId: ACTOR_MEMBERSHIP_ID,
      intendedEmailNormalized: 'target@example.invalid',
      intendedProviderSubject: null,
      requestedRoleKeys: ['lawyer'],
      requestedScope: null,
      status: 'REVOKED',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new InvitationService(
      fixture.prisma as never,
      fixture.audit as never,
      fixture.redis as never,
      fixture.config as never,
    );

    await expect(
      service.accept({
        session: createSession(),
        token: 'e'.repeat(43),
        correlationId: CORRELATION_ID,
        sourceIp: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.transaction.invitation.updateMany).not.toHaveBeenCalled();
  });

  void ROLE_ID;
});

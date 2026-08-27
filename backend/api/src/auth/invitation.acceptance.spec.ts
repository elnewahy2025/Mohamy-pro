import { InvitationService } from './invitation.service';
import type { AuthenticatedSession } from './auth.types';

const ACTOR_MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_USER_ID = '55555555-5555-4555-8555-555555555555';
const CORRELATION_ID = '66666666-6666-4666-8666-666666666666';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';
const MEMBERSHIP_ID = '88888888-8888-4888-8888-888888888888';
const ROLE_ID = '99999999-9999-4999-8999-999999999999';

function session(): AuthenticatedSession {
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
  };
}

describe('InvitationService acceptance transaction', () => {
  it('activates the authenticated user atomically and invalidates the one-time token', async () => {
    const transaction = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: INVITATION_ID,
          tenantId: TENANT_ID,
          inviterMembershipId: ACTOR_MEMBERSHIP_ID,
          intendedEmailNormalized: 'target@example.invalid',
          intendedProviderSubject: null,
          requestedRoleKeys: ['lawyer'],
          requestedScope: {
            branchIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
          },
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: TENANT_ID, status: 'ACTIVE' }),
      },
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            status: 'ACTIVE',
            activeFrom: null,
            activeUntil: null,
          })
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({
          id: MEMBERSHIP_ID,
          tenantId: TENANT_ID,
          userId: TARGET_USER_ID,
          status: 'ACTIVE',
        }),
        update: jest.fn(),
      },
      role: {
        findMany: jest.fn().mockResolvedValue([{ id: ROLE_ID, key: 'lawyer' }]),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: TARGET_USER_ID, status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({}),
      },
      organization: { count: jest.fn().mockResolvedValue(0) },
      branch: { count: jest.fn().mockResolvedValue(1) },
      department: { count: jest.fn().mockResolvedValue(0) },
      team: { count: jest.fn().mockResolvedValue(0) },
      membershipRole: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'inviter-role-assignment' }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      withInvitationAcceptanceContext: jest.fn((_context, callback) =>
        callback(transaction),
      ),
      bindInvitationAcceptanceContext: jest.fn(),
    };
    const audit = { recordInTransaction: jest.fn().mockResolvedValue({}) };
    const redis = {
      getClient: jest
        .fn()
        .mockReturnValue({ eval: jest.fn().mockResolvedValue(1) }),
    };
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'INVITATION_ACCEPTANCE_WINDOW_SECONDS' ? 3600 : 10,
      ),
    };
    const service = new InvitationService(
      prisma as never,
      audit as never,
      redis as never,
      config as never,
    );

    const result = await service.accept({
      session: session(),
      token: 'a'.repeat(43),
      correlationId: CORRELATION_ID,
      sourceIp: '127.0.0.1',
    });

    expect(result).toEqual({
      invitationId: INVITATION_ID,
      tenantId: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      roleKeys: ['lawyer'],
      active: true,
    });
    expect(transaction.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          userId: TARGET_USER_ID,
          status: 'ACTIVE',
        }),
      }),
    );
    expect(transaction.membershipRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: TENANT_ID,
          membershipId: MEMBERSHIP_ID,
          roleId: ROLE_ID,
          assignmentScope: {
            branchIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
          },
        }),
      }),
    );
    expect(transaction.membershipRole.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        membershipId: ACTOR_MEMBERSHIP_ID,
        revokedAt: null,
        role: {
          scope: 'TENANT',
          tenantId: TENANT_ID,
          permissions: {
            some: { permission: { key: 'membership.manage' } },
          },
        },
      },
      select: { id: true },
    });
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_USER_ID },
      data: { status: 'ACTIVE' },
    });
    expect(transaction.invitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: INVITATION_ID,
          tenantId: TENANT_ID,
          status: 'PENDING',
        }),
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      }),
    );
    expect(audit.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'membership.invitation.accepted',
        actorUserId: TARGET_USER_ID,
        actorMembershipId: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
      }),
      transaction,
    );
    expect(prisma.bindInvitationAcceptanceContext).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        tenantId: TENANT_ID,
        membershipId: MEMBERSHIP_ID,
        inviterMembershipId: ACTOR_MEMBERSHIP_ID,
      }),
    );
  });
});

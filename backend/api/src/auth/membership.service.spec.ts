import {
  TenantContextRequiredError,
  TenantSwitchConflictError,
} from './membership.errors';
import { MembershipService } from './membership.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_TENANT_ID = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP_ID = '44444444-4444-4444-8444-444444444444';
const CORRELATION_ID = '55555555-5555-4555-8555-555555555555';

function createAudit() {
  return {
    recordInTransaction: jest.fn().mockResolvedValue({}),
    recordGlobal: jest.fn().mockResolvedValue({}),
  };
}

function createFixture(overrides: Record<string, unknown> = {}) {
  const transaction = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, status: 'ACTIVE' }),
    },
    membership: {
      findUnique: jest.fn().mockResolvedValue({
        id: MEMBERSHIP_ID,
        tenantId: TARGET_TENANT_ID,
        userId: USER_ID,
        status: 'ACTIVE',
        activeFrom: null,
        activeUntil: null,
        tenant: { status: 'ACTIVE' },
      }),
    },
    appSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ contextVersion: 1 }),
      findFirst: jest.fn(),
    },
  };
  const prisma = {
    withMembershipSelectionContext: jest.fn(
      (_context: unknown, callback: (value: unknown) => unknown) =>
        callback(transaction),
    ),

    bindTenantContext: jest.fn().mockResolvedValue(undefined),
    withGlobalOperationContext: jest.fn(
      (_operationId: string, callback: (value: unknown) => unknown) =>
        callback(transaction as never),
    ),
  };
  const audit = createAudit();
  Object.assign(transaction, overrides);
  return {
    transaction,
    prisma,
    audit,
    service: new MembershipService(prisma as never, audit as never),
  };
}

describe('MembershipService', () => {
  it('switches to an active membership atomically and records the tenant audit event', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.switchTenant({
        sessionId: SESSION_ID,
        userId: USER_ID,
        targetTenantId: TARGET_TENANT_ID,
        correlationId: CORRELATION_ID,
        expectedContextVersion: 0,
        sourceTenantId: null,
        sourceMembershipId: null,
      }),
    ).resolves.toEqual({
      tenantId: TARGET_TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      contextVersion: 1,
    });

    expect(fixture.prisma.bindTenantContext).toHaveBeenCalledWith(
      fixture.transaction,
      {
        tenantId: TARGET_TENANT_ID,
        userId: USER_ID,
        membershipId: MEMBERSHIP_ID,
        operationId: expect.any(String),
      },
    );
    expect(fixture.transaction.appSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: SESSION_ID,
        userId: USER_ID,
        status: 'ACTIVE',
        contextVersion: 0,
      },
      data: {
        activeTenantId: TARGET_TENANT_ID,
        activeMembershipId: MEMBERSHIP_ID,
        contextVersion: { increment: 1 },
      },
    });
    expect(fixture.audit.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'tenant.switch.succeeded',
        actorUserId: USER_ID,
        actorMembershipId: MEMBERSHIP_ID,
        tenantId: TARGET_TENANT_ID,
      }),
      fixture.transaction,
    );
  });

  it.each([
    ['INVITED', null, null],
    ['SUSPENDED', null, null],
    ['REMOVED', null, null],
    ['ACTIVE', new Date(Date.now() + 60_000), null],
    ['ACTIVE', null, new Date(Date.now() - 60_000)],
  ] as const)(
    'denies a membership that is not currently eligible: %s',
    async (status, activeFrom, activeUntil) => {
      const fixture = createFixture();
      fixture.transaction.membership.findUnique.mockResolvedValue({
        id: MEMBERSHIP_ID,
        tenantId: TARGET_TENANT_ID,
        userId: USER_ID,
        status,
        activeFrom,
        activeUntil,
        tenant: { status: 'ACTIVE' },
      });

      await expect(
        fixture.service.switchTenant({
          sessionId: SESSION_ID,
          userId: USER_ID,
          targetTenantId: TARGET_TENANT_ID,
          correlationId: CORRELATION_ID,
          expectedContextVersion: 0,
          sourceTenantId: null,
          sourceMembershipId: null,
        }),
      ).rejects.toBeInstanceOf(TenantContextRequiredError);

      expect(fixture.transaction.appSession.updateMany).not.toHaveBeenCalled();
      expect(fixture.audit.recordGlobal).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'tenant.switch.denied',
          reasonCode: 'membership_not_eligible',
        }),
      );
    },
  );

  it('denies a non-active user without changing the session context', async () => {
    const fixture = createFixture();
    fixture.transaction.user.findUnique.mockResolvedValue({
      id: USER_ID,
      status: 'PENDING',
    });

    await expect(
      fixture.service.switchTenant({
        sessionId: SESSION_ID,
        userId: USER_ID,
        targetTenantId: TARGET_TENANT_ID,
        correlationId: CORRELATION_ID,
        expectedContextVersion: 0,
        sourceTenantId: null,
        sourceMembershipId: null,
      }),
    ).rejects.toBeInstanceOf(TenantContextRequiredError);

    expect(fixture.audit.recordGlobal).toHaveBeenCalled();
    expect(fixture.transaction.appSession.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed on a stale context version and preserves the replacement state', async () => {
    const fixture = createFixture();
    fixture.transaction.appSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      fixture.service.switchTenant({
        sessionId: SESSION_ID,
        userId: USER_ID,
        targetTenantId: TARGET_TENANT_ID,
        correlationId: CORRELATION_ID,
        expectedContextVersion: 3,
        sourceTenantId: null,
        sourceMembershipId: null,
      }),
    ).rejects.toBeInstanceOf(TenantSwitchConflictError);

    expect(fixture.audit.recordGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'stale_session_context' }),
    );
  });
});

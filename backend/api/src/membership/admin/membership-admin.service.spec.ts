import type { Request } from 'express';
import { AbuseControlService } from '../../abuse/abuse-control.service';
import { MFA_RATE_LIMITED } from '../../abuse/abuse-control.constants';
import { AbuseLimitReachedError } from '../../abuse/abuse-control.errors';
import { AuditEventService } from '../../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { MfaAssuranceService } from '../../auth/mfa/mfa-assurance.service';
import { MfaStepUpRequiredError } from '../../auth/mfa/mfa.errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { PermissionsService } from '../../permissions/permissions.service';
import { MembershipAdminDeniedError } from './membership-admin.errors';
import { MembershipAdminService } from './membership-admin.service';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_MEMBERSHIP = '55555555-5555-4555-8555-555555555555';
const TARGET_MEMBERSHIP = '77777777-7777-4777-8777-777777777777';

const AUTH = {
  sessionId: SESSION_ID,
  userId: USER_ID,
  provider: 'oidc',
  providerSubject: 'sub',
  activeTenantId: TENANT_ID,
};

function request(): Request {
  return {
    auth: AUTH as object,
    header: jest.fn(() => 'corr'),
    headers: {},
    ip: '1.2.3.4',
  } as unknown as Request;
}

function makeService(input: {
  targetStatus: string;
  auditEvent?: string;
  mfa?: { assertRecentMfa: jest.Mock };
  abuse?: {
    enforceMfaFailure?: jest.Mock;
    emitAbuseEvent?: jest.Mock;
  };
}) {
  const mfa = {
    assertRecentMfa: jest.fn().mockResolvedValue(undefined),
    ...input.mfa,
  } as unknown as MfaAssuranceService;
  const permissions = {
    assertTenantPermission: jest
      .fn()
      .mockResolvedValue({ membershipId: ACTOR_MEMBERSHIP }),
  } as unknown as PermissionsService;
  const auditWrite = jest.fn().mockResolvedValue({ id: 'audit-1' });
  const audit = { write: auditWrite } as unknown as AuditEventService;
  const enforceMfaFailure =
    input.abuse?.enforceMfaFailure ??
    jest.fn().mockResolvedValue({
      allowed: true,
      reason: null,
      retryAfterSeconds: null,
    });
  const emitAbuseEvent =
    input.abuse?.emitAbuseEvent ?? jest.fn().mockResolvedValue(undefined);
  const abuse = {
    enforceMfaFailure,
    emitAbuseEvent,
  } as unknown as AbuseControlService;

  const tenantTx = {
    membership: {
      findFirst: jest.fn().mockResolvedValue({
        id: TARGET_MEMBERSHIP,
        status: input.targetStatus,
        activeUntil: null,
      }),
      update: jest.fn().mockResolvedValue({ id: TARGET_MEMBERSHIP }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'a' }) },
  };
  const tenantContext = jest.fn(
    (ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(tenantTx),
  );
  const prisma = {
    withTenantContext: tenantContext,
  } as unknown as PrismaService;

  const service = new MembershipAdminService(
    prisma,
    audit,
    permissions,
    mfa,
    abuse,
  );
  return {
    service,
    auditWrite,
    permissions,
    mfa,
    abuse,
    enforceMfaFailure,
    emitAbuseEvent,
    tenantTx,
  };
}

describe('MembershipAdminService', () => {
  it('suspends an active membership with a SECURITY audit event', async () => {
    const { service, auditWrite, tenantTx } = makeService({
      targetStatus: 'ACTIVE',
    });
    const result = await service.suspend(request(), {
      membershipId: TARGET_MEMBERSHIP,
      reason: 'misconduct',
    });
    expect(result.status).toBe('SUSPENDED');
    expect(
      (auditWrite.mock.calls[0][0] as { eventType: string }).eventType,
    ).toBe(AUDIT_EVENT_TYPES.MEMBERSHIP_SUSPENDED);
    const updateData = (tenantTx.membership.update as jest.Mock).mock
      .calls[0][0].data as Record<string, unknown>;
    expect(updateData.reason).toBeUndefined();
    expect(updateData.status).toBe('SUSPENDED');
    expect(updateData.suspendedAt).toBeInstanceOf(Date);
  });

  it('rejects suspend of a membership that is already removed', async () => {
    const { service } = makeService({ targetStatus: 'REMOVED' });
    await expect(
      service.suspend(request(), { membershipId: TARGET_MEMBERSHIP }),
    ).rejects.toBeInstanceOf(MembershipAdminDeniedError);
  });

  it('expires an active membership', async () => {
    const { service } = makeService({ targetStatus: 'ACTIVE' });
    const result = await service.expire(request(), {
      membershipId: TARGET_MEMBERSHIP,
    });
    expect(result.status).toBe('EXPIRED');
  });

  it('reinstate requires a valid window', async () => {
    const { service } = makeService({ targetStatus: 'SUSPENDED' });
    await expect(
      service.reinstate(request(), {
        membershipId: TARGET_MEMBERSHIP,
        activeFrom: '2026-01-02T00:00:00Z',
        activeUntil: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(MembershipAdminDeniedError);
  });

  it('requires an active tenant context', async () => {
    const { service } = makeService({ targetStatus: 'ACTIVE' });
    const req = request();
    req.auth = { ...AUTH, activeTenantId: null };
    await expect(
      service.suspend(req, { membershipId: TARGET_MEMBERSHIP }),
    ).rejects.toBeInstanceOf(MembershipAdminDeniedError);
  });

  it('enumerates a failed MFA step-up toward the failure limit and rethrows', async () => {
    const emitAbuseEvent = jest.fn().mockResolvedValue(undefined);
    const enforceMfaFailure = jest.fn().mockResolvedValue({
      allowed: true,
      reason: null,
      retryAfterSeconds: null,
    });
    const { service, auditWrite } = makeService({
      targetStatus: 'ACTIVE',
      mfa: {
        assertRecentMfa: jest
          .fn()
          .mockRejectedValue(new MfaStepUpRequiredError('MFA_REQUIRED')),
      },
      abuse: { enforceMfaFailure, emitAbuseEvent },
    });

    await expect(
      service.suspend(request(), { membershipId: TARGET_MEMBERSHIP }),
    ).rejects.toBeInstanceOf(MfaStepUpRequiredError);

    expect(enforceMfaFailure).toHaveBeenCalledWith(SESSION_ID);
    expect(emitAbuseEvent).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it('rejects with AbuseLimitReachedError once the failed-MFA limit is reached and emits the abuse event', async () => {
    const emitAbuseEvent = jest.fn().mockResolvedValue(undefined);
    const enforceMfaFailure = jest.fn().mockResolvedValue({
      allowed: false,
      reason: 'MFA_RATE_LIMITED',
      retryAfterSeconds: 900,
    });
    const { service, auditWrite } = makeService({
      targetStatus: 'ACTIVE',
      mfa: {
        assertRecentMfa: jest
          .fn()
          .mockRejectedValue(new MfaStepUpRequiredError('MFA_REQUIRED')),
      },
      abuse: { enforceMfaFailure, emitAbuseEvent },
    });

    await expect(
      service.suspend(request(), { membershipId: TARGET_MEMBERSHIP }),
    ).rejects.toBeInstanceOf(AbuseLimitReachedError);

    expect(enforceMfaFailure).toHaveBeenCalledWith(SESSION_ID);
    expect(emitAbuseEvent).toHaveBeenCalledWith(
      expect.anything(),
      MFA_RATE_LIMITED,
      { actorUserId: USER_ID, tenantId: TENANT_ID },
    );
    expect(auditWrite).not.toHaveBeenCalled();
  });
});

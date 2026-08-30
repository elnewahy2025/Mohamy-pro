import type { Request } from 'express';
import { AuditEventService } from '../../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TenantSwitchDeniedError } from './tenant-switch.errors';
import { TenantSwitchService } from './tenant-switch.service';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';

function activeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBERSHIP_ID,
    status: 'ACTIVE',
    activeFrom: null,
    activeUntil: null,
    tenant: { id: TENANT_ID, slug: 'acme', name: 'Acme', status: 'ACTIVE' },
    ...overrides,
  };
}

const AUTHENTICATED = {
  sessionId: SESSION_ID,
  userId: USER_ID,
  provider: 'oidc',
  providerSubject: 'sub',
  activeTenantId: null,
};

function request(overrides: { auth?: unknown } = {}): Request {
  const auth =
    'auth' in overrides
      ? (overrides.auth as object | null | undefined)
      : AUTHENTICATED;
  return {
    auth: auth ?? undefined,
    header: jest.fn(() => 'test-correlation-id'),
    headers: {},
  } as unknown as Request;
}

function makeService(input: {
  loadMembership: unknown;
  auditWrite?: jest.Mock;
}) {
  const auditWrite =
    input.auditWrite ?? jest.fn().mockResolvedValue({ id: 'audit-1' });
  const audit = { write: auditWrite } as unknown as AuditEventService;

  const membershipTx = {
    membership: {
      findFirst: jest.fn().mockResolvedValue(input.loadMembership),
    },
  };
  const membershipSelection = jest.fn(
    (context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      void context;
      return callback(membershipTx);
    },
  );
  const tenantTx = {
    appSession: { update: jest.fn().mockResolvedValue({ id: SESSION_ID }) },
  };
  const tenantContext = jest.fn(
    (context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      void context;
      return callback(tenantTx);
    },
  );

  const prisma = {
    withMembershipSelectionContext: membershipSelection,
    withTenantContext: tenantContext,
  } as unknown as PrismaService;

  const service = new TenantSwitchService(prisma, audit);
  return {
    service,
    auditWrite,
    membershipSelection,
    tenantContext,
    tenantTx,
  };
}

describe('TenantSwitchService', () => {
  it('switches the session tenant and records a succeeded audit event atomically', async () => {
    const { service, auditWrite, tenantTx } = makeService({
      loadMembership: activeMembership(),
    });

    const result = await service.switchTenant(request(), TENANT_ID);

    expect(result).toEqual({
      tenantId: TENANT_ID,
      slug: 'acme',
      name: 'Acme',
      membershipId: MEMBERSHIP_ID,
    });
    expect(tenantTx.appSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        activeTenantId: TENANT_ID,
        activeMembershipId: MEMBERSHIP_ID,
        contextVersion: { increment: 1 },
      },
    });
    expect(auditWrite).toHaveBeenCalledTimes(1);
    const auditInput = auditWrite.mock.calls[0][0];
    expect(auditInput.eventType).toBe(
      AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED,
    );
    expect(auditInput.outcome).toBe('SUCCEEDED');
    expect(auditInput.tenantId).toBe(TENANT_ID);
    expect(auditInput.actorMembershipId).toBe(MEMBERSHIP_ID);
    expect(auditWrite.mock.calls[0][1]).toBe(tenantTx);
  });

  it('denies when the user has no membership in the target tenant', async () => {
    const { service, auditWrite } = makeService({ loadMembership: null });

    await expect(
      service.switchTenant(request(), TENANT_ID),
    ).rejects.toBeInstanceOf(TenantSwitchDeniedError);
    expect(auditWrite).toHaveBeenCalledTimes(1);
    const auditInput = auditWrite.mock.calls[0][0];
    expect(auditInput.eventType).toBe(AUDIT_EVENT_TYPES.TENANT_SWITCH_DENIED);
    expect(auditInput.outcome).toBe('DENIED');
    expect(auditInput.tenantId).toBeNull();
    expect(auditInput.reasonCode).toBe('NO_MEMBERSHIP');
  });

  it('denies a suspended membership without enumerating the reason', async () => {
    const { service } = makeService({
      loadMembership: activeMembership({ status: 'SUSPENDED' }),
    });

    await expect(
      service.switchTenant(request(), TENANT_ID),
    ).rejects.toBeInstanceOf(TenantSwitchDeniedError);
  });

  it('exposes a single non-enumerating FORBIDDEN error across denial reasons', async () => {
    for (const membership of [
      null,
      activeMembership({ status: 'SUSPENDED' }),
      activeMembership({ activeFrom: new Date(Date.now() + 86_400_000) }),
      activeMembership({ activeUntil: new Date(Date.now() - 1) }),
    ]) {
      const { service } = makeService({ loadMembership: membership });
      try {
        await service.switchTenant(request(), TENANT_ID);
        throw new Error('expected denial');
      } catch (error) {
        expect(error).toBeInstanceOf(TenantSwitchDeniedError);
        const denied = error as TenantSwitchDeniedError;
        expect(denied.getStatus()).toBe(403);
        expect(denied.code).toBe('FORBIDDEN');
        expect(denied.message).toBe('Cannot switch tenant.');
      }
    }
  });

  it('rejects unauthenticated requests as a denial', async () => {
    const { service } = makeService({ loadMembership: activeMembership() });

    await expect(
      service.switchTenant(request({ auth: null }), TENANT_ID),
    ).rejects.toBeInstanceOf(TenantSwitchDeniedError);
  });
});

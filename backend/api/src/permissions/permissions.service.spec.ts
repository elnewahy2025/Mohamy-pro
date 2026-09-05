import type { Request } from 'express';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PERMISSION_KEYS } from './permission.constants';
import { PermissionDeniedError } from './permission.errors';
import { PermissionsService } from './permissions.service';

const USER_ID = '22222222-2222-4222-8222-222222222222';

const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';
const OP_ID = '66666666-6666-4666-8666-666666666666';

function request(): Request {
  return { header: jest.fn(() => 'corr'), headers: {} } as unknown as Request;
}

function input(
  overrides: Partial<
    Parameters<PermissionsService['assertTenantPermission']>[0]
  > = {},
) {
  return {
    request: request(),
    userId: USER_ID,
    tenantId: TENANT_ID,
    permissionKey: PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
    operationId: OP_ID,
    ...overrides,
  };
}

function makeService(input: {
  membership: { id: string; status: string } | null;
  rolePermissionKeys: string[];
  directPermissionKeys?: string[];
  denials?: Record<string, unknown>[];
}) {
  const auditWrite = jest.fn().mockResolvedValue({ id: 'audit-1' });
  const audit = { write: auditWrite } as unknown as AuditEventService;

  const selectionTx = {
    membership: { findFirst: jest.fn().mockResolvedValue(input.membership) },
    globalRoleAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'a' }) },
  };
  const membershipSelection = jest.fn(
    (ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(selectionTx),
  );

  const accessDenialFindFirst = jest.fn(
    async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      const and = (where.AND ?? []) as Record<string, unknown>[];
      const flat: Record<string, unknown> = { ...where };
      delete flat.AND;
      const matches = (input.denials ?? []).filter((denial) => {
        const d = denial as Record<string, unknown>;
        for (const clause of and) {
          if (!matchesClause(d, clause)) return false;
        }
        for (const [key, value] of Object.entries(flat)) {
          if ((d as Record<string, unknown>)[key] !== value) return false;
        }
        return true;
      });
      return matches[0] ?? null;
    },
  );

  function matchesClause(
    denial: Record<string, unknown>,
    clause: Record<string, unknown>,
  ): boolean {
    if ('OR' in clause) {
      return (clause.OR as Record<string, unknown>[]).some((branch) =>
        matchesClause(denial, branch),
      );
    }
    return Object.entries(clause).every(([key, value]) => {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const ops = value as Record<string, unknown>;
        if ('lte' in ops) return (denial[key] as Date) <= (ops.lte as Date);
        if ('gt' in ops) return (denial[key] as Date) > (ops.gt as Date);
        return false;
      }
      return denial[key] === value;
    });
  }

  const tenantTx = {
    membershipRole: {
      findMany: jest.fn().mockResolvedValue(
        input.rolePermissionKeys.map((key) => ({
          role: { permissions: [{ permission: { key } }] },
        })),
      ),
    },
    directPermissionGrant: {
      findMany: jest.fn().mockResolvedValue(
        (input.directPermissionKeys ?? []).map((key) => ({
          permissionKey: key,
        })),
      ),
    },
    accessDenial: { findFirst: accessDenialFindFirst },
  };
  const tenantContext = jest.fn(
    (ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(tenantTx),
  );

  const prisma = {
    withMembershipSelectionContext: membershipSelection,
    withTenantContext: tenantContext,
    $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
      cb(tenantTx),
    ),
    tenant: { findMany: jest.fn().mockResolvedValue([]) },
    role: { findFirst: jest.fn().mockResolvedValue(null) },
    permission: { findUnique: jest.fn().mockResolvedValue({ id: 'perm-1' }) },
    rolePermission: { upsert: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const service = new PermissionsService(prisma, audit);
  return {
    service,
    auditWrite,
    membershipSelection,
    tenantContext,
    accessDenialFindFirst,
  };
}

const ACTIVE_DENIAL = {
  id: 'denial-1',
  tenantId: TENANT_ID,
  permissionKey: PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
  status: 'ACTIVE',
  subjectUserId: null,
  resourceType: null,
  resourceId: null,
  startsAt: new Date('2020-01-01T00:00:00Z'),
  endsAt: null,
};

describe('PermissionsService', () => {
  it('permits an active member whose role grants the named permission', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
    });

    await expect(service.assertTenantPermission(input())).resolves.toEqual({
      membershipId: MEMBERSHIP_ID,
    });
  });

  it('denies a member whose roles do not grant the permission', async () => {
    const { service, auditWrite } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [],
    });

    await expect(
      service.assertTenantPermission(input()),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    const deniedCall = auditWrite.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { eventType: string }).eventType ===
        AUDIT_EVENT_TYPES.PERMISSION_DENIED,
    );
    expect(deniedCall).toBeDefined();
    expect((deniedCall[0] as { outcome: string }).outcome).toBe('DENIED');
  });

  it('denies when the user has no membership in the tenant', async () => {
    const { service } = makeService({
      membership: null,
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
    });
    await expect(
      service.assertTenantPermission(input()),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('denies a suspended membership without enumerating', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'SUSPENDED' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
    });
    try {
      await service.assertTenantPermission(input());
      throw new Error('expected denial');
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionDeniedError);
      const denied = error as PermissionDeniedError;
      expect(denied.getStatus()).toBe(403);
      expect(denied.code).toBe('FORBIDDEN');
    }
  });

  it('grants CanSwitchTenant to an ACTIVE membership as a default, even without a role grant (W3)', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [],
    });

    await expect(
      service.assertTenantPermission(
        input({ permissionKey: PERMISSION_KEYS.CAN_SWITCH_TENANT }),
      ),
    ).resolves.toEqual({ membershipId: MEMBERSHIP_ID });
  });

  it('denies a role grant overridden by an explicit denial (G2-2)', async () => {
    const { service, auditWrite } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [ACTIVE_DENIAL],
    });

    await expect(
      service.assertTenantPermission(input()),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    const deniedCall = auditWrite.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { reasonCode?: string }).reasonCode ===
        'DENIED_BY_EXPLICIT_DENIAL',
    );
    expect(deniedCall).toBeDefined();
  });

  it('denies a direct grant overridden by an explicit denial (G2-3)', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [],
      directPermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [ACTIVE_DENIAL],
    });

    await expect(
      service.assertTenantPermission(input()),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('allows a direct grant with no denial present', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [],
      directPermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
    });

    await expect(service.assertTenantPermission(input())).resolves.toEqual({
      membershipId: MEMBERSHIP_ID,
    });
  });

  it('denies despite multiple role grants when denied (G2-4)', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [
        PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
        PERMISSION_KEYS.CAN_VIEW_TENANT,
      ],
      directPermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [ACTIVE_DENIAL],
    });

    await expect(
      service.assertTenantPermission(input()),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('denies when nothing is granted but a denial exists (G2-5)', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [],
      denials: [ACTIVE_DENIAL],
    });

    await expect(
      service.assertTenantPermission(input()),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('scopes denial lookup to the active tenant (G2-6)', async () => {
    const { service, accessDenialFindFirst } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [{ ...ACTIVE_DENIAL, tenantId: 'other-tenant' }],
    });

    await expect(service.assertTenantPermission(input())).resolves.toEqual({
      membershipId: MEMBERSHIP_ID,
    });
    const where = accessDenialFindFirst.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ tenantId: TENANT_ID });
  });

  it('respects denial scope: mismatched resource allows, matched denies (G2-7)', async () => {
    const resourceDenial = {
      ...ACTIVE_DENIAL,
      resourceType: 'case',
      resourceId: 'case-1',
    };
    const scoped = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [resourceDenial],
    });

    await expect(
      scoped.service.assertTenantPermission(
        input({ resource: { type: 'case', id: 'case-2' } }),
      ),
    ).resolves.toEqual({ membershipId: MEMBERSHIP_ID });
    await expect(
      scoped.service.assertTenantPermission(
        input({ resource: { type: 'case', id: 'case-1' } }),
      ),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('applies subject-scoped denials only to the subject user', async () => {
    const otherDenied = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [{ ...ACTIVE_DENIAL, subjectUserId: 'other-user' }],
    });
    await expect(
      otherDenied.service.assertTenantPermission(input()),
    ).resolves.toEqual({ membershipId: MEMBERSHIP_ID });

    const selfDenied = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [{ ...ACTIVE_DENIAL, subjectUserId: USER_ID }],
    });
    await expect(
      selfDenied.service.assertTenantPermission(input()),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('restores the grant after the denial is revoked or expires (G2-8)', async () => {
    const revoked = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [{ ...ACTIVE_DENIAL, status: 'REVOKED' }],
    });
    await expect(
      revoked.service.assertTenantPermission(input()),
    ).resolves.toEqual({ membershipId: MEMBERSHIP_ID });

    const expired = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [{ ...ACTIVE_DENIAL, endsAt: new Date('2020-06-01T00:00:00Z') }],
    });
    await expect(
      expired.service.assertTenantPermission(input()),
    ).resolves.toEqual({ membershipId: MEMBERSHIP_ID });

    const future = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'ACTIVE' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP],
      denials: [
        { ...ACTIVE_DENIAL, startsAt: new Date('2999-01-01T00:00:00Z') },
      ],
    });
    await expect(
      future.service.assertTenantPermission(input()),
    ).resolves.toEqual({ membershipId: MEMBERSHIP_ID });
  });

  it('denies CanSwitchTenant for a membership that is not ACTIVE (W3)', async () => {
    const { service } = makeService({
      membership: { id: MEMBERSHIP_ID, status: 'SUSPENDED' },
      rolePermissionKeys: [PERMISSION_KEYS.CAN_SWITCH_TENANT],
    });

    await expect(
      service.assertTenantPermission(
        input({ permissionKey: PERMISSION_KEYS.CAN_SWITCH_TENANT }),
      ),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

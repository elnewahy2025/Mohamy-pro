import type { Request } from 'express';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PERMISSION_KEYS } from './permission.constants';
import { PermissionDeniedError } from './permission.errors';
import { PermissionsService } from './permissions.service';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';
const OP_ID = '66666666-6666-4666-8666-666666666666';

function request(): Request {
  return { header: jest.fn(() => 'corr'), headers: {} } as unknown as Request;
}

function input(overrides: Partial<Parameters<PermissionsService['assertTenantPermission']>[0]> = {}) {
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
    (ctx: unknown, cb: (tx: unknown) => Promise<unknown>) =>
      cb(selectionTx),
  );

  const tenantTx = {
    membershipRole: {
      findMany: jest.fn().mockResolvedValue(
        input.rolePermissionKeys.map((key) => ({
          role: { permissions: [{ permission: { key } }] },
        })),
      ),
    },
  };
  const tenantContext = jest.fn(
    (ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(tenantTx),
  );

  const prisma = {
    withMembershipSelectionContext: membershipSelection,
    withTenantContext: tenantContext,
    $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tenantTx)),
    tenant: { findMany: jest.fn().mockResolvedValue([]) },
    role: { findFirst: jest.fn().mockResolvedValue(null) },
    permission: { findUnique: jest.fn().mockResolvedValue({ id: 'perm-1' }) },
    rolePermission: { upsert: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const service = new PermissionsService(prisma, audit);
  return { service, auditWrite, membershipSelection, tenantContext };
}

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
      (call: unknown[]) => (call[0] as { eventType: string }).eventType === AUDIT_EVENT_TYPES.PERMISSION_DENIED,
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
});

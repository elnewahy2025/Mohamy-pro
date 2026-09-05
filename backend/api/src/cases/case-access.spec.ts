import type { Request } from 'express';
import { CaseOperations } from './case.operations';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AuditEventService } from '../audit/audit-event.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSION_KEYS } from '../permissions/permission.constants';
import { PermissionDeniedError } from '../permissions/permission.errors';

function request(): Request {
  return {
    auth: { userId: 'u1', activeTenantId: 't1', sessionId: 's1' },
    headers: {},
  } as unknown as Request;
}

function operations(grantedKeys: string[]) {
  const permissions = {
    assertTenantPermission: jest.fn(
      async (input: { permissionKey: string }) => {
        if (grantedKeys.includes(input.permissionKey)) {
          return { membershipId: 'mem-1' };
        }
        throw new PermissionDeniedError(input.permissionKey, 'MISSING');
      },
    ),
  } as unknown as PermissionsService;
  const prisma = {} as unknown as PrismaService;
  const audit = {} as unknown as AuditEventService;
  return new CaseOperations(prisma, audit, permissions);
}

describe('CaseOperations.authorizeCaseAccess (G5)', () => {
  it('returns FULL scope for CanManageCases holders', async () => {
    const ops = operations([PERMISSION_KEYS.CAN_MANAGE_CASES]);

    const ctx = await ops.authorizeCaseAccess(request());

    expect(ctx.scope).toBe('FULL');
    expect(ctx.actorMembershipId).toBe('mem-1');
  });

  it('returns ASSIGNED scope for assigned-key-only holders', async () => {
    const ops = operations([PERMISSION_KEYS.CAN_ACCESS_ASSIGNED_CASES]);

    const ctx = await ops.authorizeCaseAccess(request());

    expect(ctx.scope).toBe('ASSIGNED');
  });

  it('denies holders of neither key with the original denial', async () => {
    const ops = operations([]);

    await expect(ops.authorizeCaseAccess(request())).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });

  it('never falls through on missing authentication', async () => {
    const ops = operations([PERMISSION_KEYS.CAN_ACCESS_ASSIGNED_CASES]);
    const unauthenticated = { headers: {} } as unknown as Request;

    await expect(ops.authorizeCaseAccess(unauthenticated)).rejects.toThrow(
      'UNAUTHENTICATED',
    );
  });
});

import type { Request } from 'express';
import { DenialController } from './denial.controller';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AuditEventService } from '../audit/audit-event.service';
import { DenialService } from './denial.service';

function request(): Request {
  return {
    auth: {
      userId: 'u1',
      activeTenantId: 't1',
      sessionId: 's1',
    },
    headers: {},
    header: jest.fn(() => 'corr'),
  } as unknown as Request;
}

function makeController(overrides: {
  assertTenantPermission?: jest.Mock;
  denial?: unknown;
}) {
  const permissions = {
    assertTenantPermission:
      overrides.assertTenantPermission ??
      jest.fn().mockResolvedValue({ membershipId: 'm1' }),
  } as unknown as PermissionsService;
  const created = (overrides.denial ?? { id: 'd1' }) as Record<string, unknown>;
  const tx = { accessDenial: { create: jest.fn() } };
  const prisma = {
    withTenantContext: jest.fn(
      (_ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    ),
  } as unknown as PrismaService;
  const audit = { write: jest.fn() } as unknown as AuditEventService;
  const denials = {
    createDenial: jest.fn().mockResolvedValue(created),
    revokeDenial: jest.fn(),
    listDenials: jest.fn(),
  } as unknown as DenialService;
  return {
    controller: new DenialController(denials, permissions, prisma, audit),
    permissions,
    denials,
    audit,
  };
}

describe('DenialController authorization gates (G2-9/G2-10)', () => {
  it('refuses denial creation without CanManageRoles', async () => {
    const { controller, denials } = makeController({
      assertTenantPermission: jest.fn().mockRejectedValue(new Error('denied')),
    });

    await expect(
      controller.createDenial(request(), {
        permissionKey: 'CanManageCases',
        reason: 'x',
      } as any),
    ).rejects.toThrow('denied');
    expect(denials.createDenial).not.toHaveBeenCalled();
  });

  it('lets an authorized admin create denials without granting anything', async () => {
    const { controller, denials, audit } = makeController({});
    const body = { permissionKey: 'CanManageCases', reason: 'review' } as any;

    const result = await controller.createDenial(request(), body);

    expect(result).toEqual({ id: 'd1' });
    expect(denials.createDenial).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'denial.created' }),
      expect.anything(),
    );
    expect(result).not.toHaveProperty('permissions');
    expect(result).not.toHaveProperty('roleId');
  });

  it('refuses revocation without CanManageRoles', async () => {
    const { controller, denials } = makeController({
      assertTenantPermission: jest.fn().mockRejectedValue(new Error('denied')),
    });

    await expect(controller.revokeDenial(request(), 'd1')).rejects.toThrow(
      'denied',
    );
    expect(denials.revokeDenial).not.toHaveBeenCalled();
  });
});

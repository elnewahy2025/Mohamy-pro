import { RoleService } from './role.service';
import { RoleInvalidStateError, RoleNotFoundError } from './role.errors';

function granterTx(heldKeys: string[]) {
  return {
    membershipRole: {
      findMany: jest.fn().mockResolvedValue(
        heldKeys.map((key) => ({
          role: { permissions: [{ permission: { key } }] },
        })),
      ),
    },
  };
}

describe('RoleService self-escalation guards', () => {
  it('rejects reserved built-in keys on create', async () => {
    const tx = { role: { findFirst: jest.fn(), create: jest.fn() } };
    const service = new RoleService();

    for (const key of ['tenant.admin', 'tenant.manager', 'platform.admin']) {
      await expect(
        service.createRole(tx as any, 't1', { key, name: 'X' } as any),
      ).rejects.toBeInstanceOf(RoleInvalidStateError);
    }
    expect(tx.role.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate keys and scopes creation to the tenant', async () => {
    const tx = {
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 'r1' }),
        create: jest.fn(),
      },
    };
    const service = new RoleService();

    await expect(
      service.createRole(tx as any, 't1', { key: 'support', name: 'S' } as any),
    ).rejects.toBeInstanceOf(RoleInvalidStateError);

    (tx.role.findFirst as jest.Mock).mockResolvedValue(null);
    await service.createRole(tx as any, 't1', {
      key: 'support',
      name: 'S',
    } as any);
    expect(tx.role.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 't1', key: 'support' }),
      }),
    );
  });

  it('refuses to grant keys the granter does not hold', async () => {
    const tx = {
      ...granterTx(['CanViewTenant']),
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          key: 'support',
          permissions: [],
        }),
      },
      permission: { findUnique: jest.fn() },
      rolePermission: { upsert: jest.fn() },
    };
    const service = new RoleService();

    await expect(
      service.grantPermissions(tx as any, 't1', 'mgr1', 'r1', [
        'CanManageCases',
      ]),
    ).rejects.toBeInstanceOf(RoleInvalidStateError);
    expect(tx.rolePermission.upsert).not.toHaveBeenCalled();
  });

  it('refuses unknown keys and built-in role mutation', async () => {
    const tx = {
      ...granterTx(['CanManageCases']),
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          key: 'tenant.admin',
          permissions: [],
        }),
      },
      permission: { findUnique: jest.fn() },
      rolePermission: { upsert: jest.fn() },
    };
    const service = new RoleService();

    await expect(
      service.grantPermissions(tx as any, 't1', 'mgr1', 'r1', [
        'CanDoAnything',
      ]),
    ).rejects.toBeInstanceOf(RoleInvalidStateError);
    await expect(
      service.grantPermissions(tx as any, 't1', 'mgr1', 'r1', [
        'CanManageCases',
      ]),
    ).rejects.toBeInstanceOf(RoleInvalidStateError);
  });

  it('refuses platform role assignment and inactive targets', async () => {
    const tx = {
      ...granterTx(['CanManageCases']),
      membership: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'm2', status: 'SUSPENDED' }),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 'r1', key: 'support' }),
      },
      membershipRole: {
        ...(granterTx([]).membershipRole as object),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const service = new RoleService();

    await expect(
      service.assignRole(tx as any, 't1', 'mgr1', 'm2', 'r1'),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it('refuses assignment when the granter lacks a key in the role', async () => {
    const tx = {
      ...granterTx(['CanViewTenant']),
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm2', status: 'ACTIVE' }),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          key: 'support',
          permissions: [{ permission: { key: 'CanManageCases' } }],
        }),
      },
      membershipRole: {
        ...(granterTx([]).membershipRole as object),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const service = new RoleService();

    await expect(
      service.assignRole(tx as any, 't1', 'mgr1', 'm2', 'r1'),
    ).rejects.toBeInstanceOf(RoleInvalidStateError);
    expect(tx.membershipRole.upsert).not.toHaveBeenCalled();
  });

  it('refuses self-removal of role assignments', async () => {
    const tx = {
      membershipRole: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new RoleService();

    await expect(
      service.revokeAssignment(tx as any, 't1', 'mgr1', 'mgr1', 'r1'),
    ).rejects.toBeInstanceOf(RoleInvalidStateError);
    expect(tx.membershipRole.update).not.toHaveBeenCalled();
  });

  it('revokes other-member assignments by stamping revokedAt', async () => {
    const tx = {
      membershipRole: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const service = new RoleService();

    const updated: any = await service.revokeAssignment(
      tx as any,
      't1',
      'mgr1',
      'm2',
      'r1',
    );
    expect(updated.revokedAt).toBeInstanceOf(Date);
  });
});

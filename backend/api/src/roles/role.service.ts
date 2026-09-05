import { Injectable } from '@nestjs/common';
import { Prisma, RoleScope } from '@prisma/client';
import { PERMISSION_CATALOG } from '../permissions/permission.constants';
import {
  ROLE_KEY_PLATFORM_ADMIN,
  ROLE_KEY_TENANT_ADMIN,
  ROLE_KEY_TENANT_MANAGER,
} from '../permissions/role.constants';
import { RoleInvalidStateError, RoleNotFoundError } from './role.errors';
import type { CreateRoleDto } from './role.dto';

const RESERVED_KEYS = new Set([
  ROLE_KEY_PLATFORM_ADMIN,
  ROLE_KEY_TENANT_ADMIN,
  ROLE_KEY_TENANT_MANAGER,
]);

@Injectable()
export class RoleService {
  private async granterKeys(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
  ): Promise<Set<string>> {
    const rows = await tx.membershipRole.findMany({
      where: { tenantId, membershipId, revokedAt: null },
      select: {
        role: {
          select: {
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    return new Set(
      rows.flatMap((entry) =>
        entry.role.permissions.map((rp) => rp.permission.key),
      ),
    );
  }

  async createRole(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateRoleDto,
  ) {
    if (RESERVED_KEYS.has(dto.key)) {
      throw new RoleInvalidStateError('Built-in role keys are immutable');
    }
    const existing = await tx.role.findFirst({
      where: { tenantId, scope: RoleScope.TENANT, key: dto.key },
      select: { id: true },
    });
    if (existing) throw new RoleInvalidStateError('Role key already exists');
    return tx.role.create({
      data: {
        tenantId,
        scope: RoleScope.TENANT,
        key: dto.key,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async listRoles(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.role.findMany({
      where: { tenantId, scope: RoleScope.TENANT },
      include: {
        permissions: { include: { permission: true } },
      },
      orderBy: { key: 'asc' },
    });
  }

  async grantPermissions(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorMembershipId: string,
    roleId: string,
    keys: string[],
  ) {
    const role = await tx.role.findFirst({
      where: { id: roleId, tenantId, scope: RoleScope.TENANT },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new RoleNotFoundError('Role not found');
    if (RESERVED_KEYS.has(role.key)) {
      throw new RoleInvalidStateError('Built-in roles are immutable');
    }
    const catalogKeys = new Set(PERMISSION_CATALOG.map((item) => item.key));
    for (const key of keys) {
      if (!catalogKeys.has(key as never)) {
        throw new RoleInvalidStateError(`Unknown permission key: ${key}`);
      }
    }
    const held = await this.granterKeys(tx, tenantId, actorMembershipId);
    for (const key of keys) {
      if (!held.has(key)) {
        throw new RoleInvalidStateError(
          `Granter does not hold permission: ${key}`,
        );
      }
    }
    for (const key of keys) {
      const permission = await tx.permission.findUnique({
        where: { key },
        select: { id: true },
      });
      if (!permission)
        throw new RoleNotFoundError(`Permission missing: ${key}`);
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        create: { roleId, permissionId: permission.id },
        update: {},
      });
    }
    return tx.role.findFirstOrThrow({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async revokePermissions(
    tx: Prisma.TransactionClient,
    tenantId: string,
    roleId: string,
    keys: string[],
  ) {
    const role = await tx.role.findFirst({
      where: { id: roleId, tenantId, scope: RoleScope.TENANT },
      select: { id: true, key: true },
    });
    if (!role) throw new RoleNotFoundError('Role not found');
    if (RESERVED_KEYS.has(role.key)) {
      throw new RoleInvalidStateError('Built-in roles are immutable');
    }
    const permissions = await tx.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    await tx.rolePermission.deleteMany({
      where: { roleId, permissionId: { in: permissions.map((p) => p.id) } },
    });
    return tx.role.findFirstOrThrow({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async assignRole(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorMembershipId: string,
    membershipId: string,
    roleId: string,
  ) {
    const [member, role] = await Promise.all([
      tx.membership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, status: true },
      }),
      tx.role.findFirst({
        where: { id: roleId, tenantId, scope: RoleScope.TENANT },
        include: { permissions: { include: { permission: true } } },
      }),
    ]);
    if (!member || member.status !== 'ACTIVE') {
      throw new RoleNotFoundError('Target membership not found');
    }
    if (!role) throw new RoleNotFoundError('Role not found');
    if (role.key === ROLE_KEY_PLATFORM_ADMIN) {
      throw new RoleInvalidStateError('Platform roles cannot be assigned here');
    }
    const held = await this.granterKeys(tx, tenantId, actorMembershipId);
    for (const rp of role.permissions) {
      if (!held.has(rp.permission.key)) {
        throw new RoleInvalidStateError(
          `Granter does not hold permission: ${rp.permission.key}`,
        );
      }
    }
    const current = await tx.membershipRole.findFirst({
      where: { membershipId, roleId, tenantId },
    });
    if (current) {
      return tx.membershipRole.update({
        where: { id: current.id },
        data: { revokedAt: null },
      });
    }
    return tx.membershipRole.create({
      data: { tenantId, membershipId, roleId },
    });
  }

  async revokeAssignment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorMembershipId: string,
    membershipId: string,
    roleId: string,
  ) {
    if (membershipId === actorMembershipId) {
      throw new RoleInvalidStateError('Cannot remove your own role assignment');
    }
    const existing = await tx.membershipRole.findFirst({
      where: { membershipId, roleId, tenantId },
    });
    if (!existing) throw new RoleNotFoundError('Assignment not found');
    return tx.membershipRole.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }
}

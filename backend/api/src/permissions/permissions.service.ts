import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma, RoleScope } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { hashToken } from '../auth/session/session-crypto';
import {
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  type PermissionKey,
} from './permission.constants';
import { PermissionDeniedError } from './permission.errors';
import {
  ROLE_KEY_PLATFORM_ADMIN,
  ROLE_KEY_TENANT_ADMIN,
} from './role.constants';

export interface TenantPermissionInput {
  request: Request;
  userId: string;
  tenantId: string;
  permissionKey: PermissionKey;
  operationId: string;
  resource?: { type: string; id: string };
}

export interface GlobalPermissionInput {
  userId: string;
  permissionKey: PermissionKey;
  operationId: string;
}

type EvaluationResult =
  { allowed: true; membershipId: string } | { allowed: false; reason: string };

const ACTIVE = 'ACTIVE';

/**
 * Application-backed named-policy authorization. For tenant-scoped permissions
 * the actor's membership is resolved under the read-only membership-selection
 * boundary, then their role→permission graph is evaluated under the tenant
 * context boundary. Denial is non-enumerating (identical FORBIDDEN response)
 * with the machine reason retained only for audit and logs.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const tenantsWired = await this.reconcileBuiltInRoles(randomUUID());
      this.logger.log(
        `Reconciled built-in role permissions for ${tenantsWired} tenant(s) at startup`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to reconcile built-in role permissions at startup',
        error as Error,
      );
    }
  }

  async assertTenantPermission(
    input: TenantPermissionInput,
  ): Promise<{ membershipId: string }> {
    const membership = await this.resolveMembership(
      input.userId,
      input.operationId,
      input.tenantId,
    );
    if (!membership.allowed) {
      await this.recordDenied(input, membership.reason);
      throw new PermissionDeniedError(input.permissionKey, membership.reason);
    }

    const evaluation = await this.evaluateTenantPermission(
      input,
      membership.membershipId,
    );
    if (!evaluation.allowed) {
      await this.recordDenied(input, evaluation.reason);
      throw new PermissionDeniedError(input.permissionKey, evaluation.reason);
    }
    return { membershipId: membership.membershipId };
  }

  async hasGlobalPermission(input: GlobalPermissionInput): Promise<boolean> {
    return this.prisma.withMembershipSelectionContext(
      { userId: input.userId, operationId: input.operationId },
      async (transaction) => {
        const key = await this.globalPermissionKeysForUser(
          transaction,
          input.userId,
        );
        return key.includes(input.permissionKey);
      },
    );
  }

  /**
   * Idempotently reconciles the built-in role→permission wiring for every
   * existing tenant's tenant.admin role and the global platform.admin role.
   * Used after the catalog migration so tenants bootstrapped before the
   * RolePermission wiring existed gain the standard permissions.
   */
  async reconcileBuiltInRoles(operationId: string): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    let tenantRolesWired = 0;

    for (const tenant of tenants) {
      const wired = await this.prisma.withTenantContext(
        {
          tenantId: tenant.id,
          userId: randomUUID(),
          membershipId: randomUUID(),
          operationId,
        },
        async (transaction) => {
          const role = await transaction.role.findFirst({
            where: {
              tenantId: tenant.id,
              scope: RoleScope.TENANT,
              key: ROLE_KEY_TENANT_ADMIN,
            },
            select: { id: true },
          });
          if (!role) return false;
          await this.grantRolePermissions(
            transaction,
            role.id,
            ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN],
          );
          return true;
        },
      );
      if (wired) tenantRolesWired += 1;
    }

    await this.prisma.$transaction(async (transaction) => {
      const globalRole = await transaction.role.findFirst({
        where: {
          scope: RoleScope.GLOBAL,
          key: ROLE_KEY_PLATFORM_ADMIN,
          tenantId: null,
        },
        select: { id: true },
      });
      if (globalRole) {
        await this.grantRolePermissions(
          transaction,
          globalRole.id,
          ROLE_PERMISSIONS[ROLE_KEY_PLATFORM_ADMIN],
        );
      }
    });

    return tenantRolesWired;
  }

  /**
   * Idempotently grants the built-in role→permission mapping for a given role.
   * Runs inside the caller's transaction (bootstrap or reconciliation) so the
   * RolePermission FORCE-RLS policy is satisfied by the surrounding context.
   */
  async grantRolePermissions(
    transaction: Prisma.TransactionClient,
    roleId: string,
    keys: readonly PermissionKey[],
  ): Promise<void> {
    for (const key of keys) {
      const permissionId = await this.ensurePermissionId(transaction, key);
      await transaction.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId, permissionId },
        },
        create: { roleId, permissionId },
        update: {},
      });
    }
  }

  private async ensurePermissionId(
    transaction: Prisma.TransactionClient,
    key: PermissionKey,
  ): Promise<string> {
    const existing = await transaction.permission.findUnique({
      where: { key },
      select: { id: true },
    });
    if (existing) return existing.id;
    const description =
      PERMISSION_CATALOG.find((item) => item.key === key)?.description ?? key;
    const created = await transaction.permission.create({
      data: { key, description },
      select: { id: true },
    });
    return created.id;
  }

  private async resolveMembership(
    userId: string,
    operationId: string,
    tenantId: string,
  ): Promise<EvaluationResult> {
    return this.prisma.withMembershipSelectionContext(
      { userId, operationId },
      async (transaction) => {
        const membership = await transaction.membership.findFirst({
          where: { userId, tenantId },
          select: { id: true, status: true },
        });
        if (!membership) return { allowed: false, reason: 'NO_MEMBERSHIP' };
        if (membership.status !== ACTIVE)
          return { allowed: false, reason: 'MEMBERSHIP_NOT_ACTIVE' };
        return { allowed: true, membershipId: membership.id };
      },
    );
  }

  private async evaluateTenantPermission(
    input: TenantPermissionInput,
    membershipId: string,
  ): Promise<EvaluationResult> {
    return this.prisma.withTenantContext(
      {
        tenantId: input.tenantId,
        userId: input.userId,
        membershipId,
        operationId: input.operationId,
      },
      async (transaction) => {
        const roles = await transaction.membershipRole.findMany({
          where: {
            tenantId: input.tenantId,
            membershipId,
            revokedAt: null,
          },
          select: {
            role: {
              select: {
                permissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        });
        const keys = new Set(
          roles.flatMap((entry) =>
            entry.role.permissions.map((rp) => rp.permission.key),
          ),
        );
        const directGrants = await transaction.directPermissionGrant.findMany({
          where: {
            tenantId: input.tenantId,
            membershipId,
            revokedAt: null,
          },
          select: { permissionKey: true },
        });
        for (const grant of directGrants) keys.add(grant.permissionKey);
        // Explicit denials override every grant (roles and direct alike).
        // Denial scope: same tenant, ACTIVE, in force now, subject unset or
        // the actor, and resource unset (key-level) or exactly matching the
        // evaluated resource. Tenant scoping is explicit AND RLS-enforced.
        const now = new Date();
        const denial = await transaction.accessDenial.findFirst({
          where: {
            AND: [
              { tenantId: input.tenantId },
              { permissionKey: input.permissionKey },
              { status: 'ACTIVE' },
              {
                OR: [{ subjectUserId: null }, { subjectUserId: input.userId }],
              },
              { startsAt: { lte: now } },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              input.resource
                ? {
                    OR: [
                      { resourceType: null, resourceId: null },
                      {
                        resourceType: input.resource.type,
                        resourceId: input.resource.id,
                      },
                    ],
                  }
                : { resourceType: null, resourceId: null },
            ],
          },
          select: { id: true },
        });
        if (denial)
          return { allowed: false, reason: 'DENIED_BY_EXPLICIT_DENIAL' };
        if (keys.has(input.permissionKey))
          return { allowed: true, membershipId };
        // CanSwitchTenant is a membership-default capability: any ACTIVE
        // membership in the target tenant may switch to it (see
        // TENANT_MEMBERSHIP_SWITCHING_DECISION / W3). The surrounding
        // resolveMembership step already guarantees the membership is ACTIVE,
        // so reaching here with an ACTIVE membership confers the policy.
        if (input.permissionKey === PERMISSION_KEYS.CAN_SWITCH_TENANT) {
          return { allowed: true, membershipId };
        }
        return { allowed: false, reason: 'MISSING_PERMISSION' };
      },
    );
  }

  private async globalPermissionKeysForUser(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<string[]> {
    const assignments = await transaction.globalRoleAssignment.findMany({
      where: { userId, revokedAt: null },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });
    return assignments.flatMap((assignment) =>
      assignment.role.permissions.map((rp) => rp.permission.key),
    );
  }

  private async recordDenied(
    input: TenantPermissionInput,
    reason: string,
  ): Promise<void> {
    const correlationId = getCorrelationId(input.request);
    try {
      await this.prisma.withMembershipSelectionContext(
        { userId: input.userId, operationId: input.operationId },
        async (transaction) => {
          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.PERMISSION_DENIED,
              outcome: 'DENIED',
              actorUserId: input.userId,
              actorMembershipId: null,
              tenantId: null,
              targetType: 'tenant',
              targetId: input.tenantId,
              policy: 'NamedPolicy',
              reasonCode: reason,
              correlationId,
              ipHash: this.optionalHash(input.request.ip),
              userAgentHash: this.optionalHash(
                input.request.headers['user-agent'],
              ),
              metadata: { permissionKey: input.permissionKey },
            },
            transaction,
          );
        },
      );
    } catch (error) {
      this.logger.warn({
        message: 'Failed to record permission-denied audit event',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value.join(',') : value;
    return raw.length === 0 ? null : hashToken(raw);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AuditEventService } from '../../audit/audit-event.service';
import type { AuditEventType } from '../../audit/audit-constants';
import { hashToken } from '../../auth/session/session-crypto';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PermissionsService } from '../../permissions/permissions.service';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../../permissions/permission.constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';

export const ORGANIZATION_CONFIG_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_MANAGE_ORGANIZATION_CONFIG;

export interface HierarchyContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

/**
 * Shared single-responsibility helper for hierarchy operations: resolves the
 * actor context from the request, asserts the CanManageOrganizationConfig
 * policy, runs a mutation inside the tenant context (RLS), and emits the audit
 * event atomically with the data change. Each hierarchy service delegates to
 * this to avoid duplicating the guard/transaction/audit mechanics.
 */
@Injectable()
export class HierarchyOperations {
  private readonly logger = new Logger(HierarchyOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<HierarchyContext> {
    const auth = request.auth;
    if (!auth) throw new OrganizationConfigDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new OrganizationConfigDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey: ORGANIZATION_CONFIG_PERMISSION,
        operationId: auth.sessionId,
      });
    return {
      sessionId: auth.sessionId,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      actorMembershipId,
    };
  }

  async run<T>(
    request: Request,
    ctx: HierarchyContext,
    eventType: AuditEventType,
    targetType: string,
    operation: (
      transaction: Prisma.TransactionClient,
    ) => Promise<T & { id: string }>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const correlationId = getCorrelationId(request);
    try {
      return await this.prisma.withTenantContext(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          membershipId: ctx.actorMembershipId,
          operationId: ctx.sessionId,
        },
        async (transaction) => {
          const entity = await operation(transaction);
          await this.audit.write(
            {
              eventType,
              outcome: 'SUCCEEDED',
              actorUserId: ctx.userId,
              actorMembershipId: ctx.actorMembershipId,
              tenantId: ctx.tenantId,
              targetType,
              targetId: entity.id,
              policy: ORGANIZATION_CONFIG_PERMISSION,
              correlationId,
              ipHash: this.optionalHash(request.ip),
              userAgentHash: this.optionalHash(request.headers['user-agent']),
              metadata,
            },
            transaction,
          );
          return entity;
        },
      );
    } catch (error) {
      if (error instanceof OrganizationConfigDeniedError) throw error;
      this.logger.warn({
        message: 'Hierarchy operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value.join(',') : value;
    return raw.length === 0 ? null : hashToken(raw);
  }
}

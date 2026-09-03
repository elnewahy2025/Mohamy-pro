import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AuditEventService } from '../audit/audit-event.service';
import type { AuditEventType } from '../audit/audit-constants';
import { hashToken } from '../auth/session/session-crypto';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../permissions/permission.constants';
import { ConflictCheckAccessDeniedError } from './conflict-check.errors';

export const CONFLICT_CHECK_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_MANAGE_CONFLICT_CHECKS;

export interface ConflictCheckContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

/**
 * Shared single-responsibility helper for conflict-check operations: resolves
 * the actor context from the request, asserts the CanManageConflictChecks
 * policy, runs a mutation inside the tenant context (RLS), and emits the audit
 * event atomically with the data change. Read-only access also passes through
 * the same authorization so a caller can never enumerate conflict checks
 * without the policy.
 */
@Injectable()
export class ConflictCheckOperations {
  private readonly logger = new Logger(ConflictCheckOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<ConflictCheckContext> {
    const auth = request.auth;
    if (!auth) throw new ConflictCheckAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new ConflictCheckAccessDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey: CONFLICT_CHECK_PERMISSION,
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
    ctx: ConflictCheckContext,
    eventType: AuditEventType,
    targetType: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
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
              targetId: (entity as { id?: string }).id ?? null,
              policy: CONFLICT_CHECK_PERMISSION,
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
      if (error instanceof ConflictCheckAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Conflict check operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async read<T>(
    request: Request,
    ctx: ConflictCheckContext,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.withTenantContext(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          membershipId: ctx.actorMembershipId,
          operationId: ctx.sessionId,
        },
        operation,
      );
    } catch (error) {
      if (error instanceof ConflictCheckAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Conflict check read failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Confirms an optional parent Client exists in the given tenant context when
   * a check is created against a specific client. Throws a non-enumerating
   * denial if the client is absent or out of tenant.
   */
  async requireClientInTenant(
    transaction: Prisma.TransactionClient,
    ctx: ConflictCheckContext,
    clientId: string,
  ): Promise<void> {
    const found = await transaction.client.findFirst({
      where: { id: clientId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!found) throw new ConflictCheckAccessDeniedError('NO_CLIENT_IN_TENANT');
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value.join(',') : value;
    return raw.length === 0 ? null : hashToken(raw);
  }
}

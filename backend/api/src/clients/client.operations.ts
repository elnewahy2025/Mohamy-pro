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
import { ClientAccessDeniedError } from './clients.errors';

export const CLIENT_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_MANAGE_CLIENTS;

export interface ClientContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

/**
 * Shared single-responsibility helper for client operations: resolves the actor
 * context from the request, asserts the CanManageClients policy, runs a
 * mutation inside the tenant context (RLS), and emits the audit event
 * atomically with the data change. Read-only list access also passes through
 * the same authorization so a caller can never enumerate clients without the
 * policy.
 */
@Injectable()
export class ClientOperations {
  private readonly logger = new Logger(ClientOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<ClientContext> {
    const auth = request.auth;
    if (!auth) throw new ClientAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new ClientAccessDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey: CLIENT_PERMISSION,
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
    ctx: ClientContext,
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
              policy: CLIENT_PERMISSION,
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
      if (error instanceof ClientAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Client operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Read path (get/list): authorizes with the same CanManageClients policy and
   * runs inside the tenant context (RLS), but emits no audit event. The list
   * endpoint must not be reachable without the policy, so enumeration is
   * prevented at the authorization layer.
   */
  async read<T>(
    request: Request,
    ctx: ClientContext,
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
      if (error instanceof ClientAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Client read failed',
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

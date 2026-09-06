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
import { BreakGlassAccessDeniedError } from './breakglass.errors';

export const BREAKGLASS_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_MANAGE_ROLES;

export interface BreakGlassContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

@Injectable()
export class BreakGlassOperations {
  private readonly logger = new Logger(BreakGlassOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<BreakGlassContext> {
    const auth = request.auth;
    if (!auth) throw new BreakGlassAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new BreakGlassAccessDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey: BREAKGLASS_PERMISSION,
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
    ctx: BreakGlassContext,
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
              policy: BREAKGLASS_PERMISSION,
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
      if (error instanceof BreakGlassAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Break-glass operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async read<T>(
    request: Request,
    ctx: BreakGlassContext,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return await this.prisma.withTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        membershipId: ctx.actorMembershipId,
        operationId: ctx.sessionId,
      },
      async (transaction) => {
        return operation(transaction);
      },
    );
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    return hashToken(Array.isArray(value) ? value.join(',') : value);
  }
}

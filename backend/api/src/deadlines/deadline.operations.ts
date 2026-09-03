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
import { DeadlineAccessDeniedError } from './deadline.errors';

export const DEADLINE_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_MANAGE_DEADLINES;

export interface DeadlineContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

@Injectable()
export class DeadlineOperations {
  private readonly logger = new Logger(DeadlineOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<DeadlineContext> {
    const auth = request.auth;
    if (!auth) throw new DeadlineAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new DeadlineAccessDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey: DEADLINE_PERMISSION,
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
    ctx: DeadlineContext,
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
              policy: DEADLINE_PERMISSION,
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
      if (error instanceof DeadlineAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Deadline operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });

      await this.audit.write(
        {
          eventType,
          outcome: 'FAILED',
          actorUserId: ctx.userId,
          actorMembershipId: ctx.actorMembershipId,
          tenantId: ctx.tenantId,
          targetType,
          targetId: null,
          policy: DEADLINE_PERMISSION,
          correlationId,
          ipHash: this.optionalHash(request.ip),
          userAgentHash: this.optionalHash(request.headers['user-agent']),
          metadata: {
            ...metadata,
            error: error instanceof Error ? error.message : String(error),
          },
        },
        this.prisma,
      );
      throw error;
    }
  }

  async read<T>(
    request: Request,
    ctx: DeadlineContext,
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

  private optionalHash(value: string | undefined): string | null {
    if (!value) return null;
    return hashToken(value);
  }
}

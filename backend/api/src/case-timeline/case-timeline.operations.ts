import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AuditEventService } from '../audit/audit-event.service';
import type { AuditEventType } from '../audit/audit-constants';
import { hashToken } from '../auth/session/session-crypto';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { authorizeCaseAccess } from '../permissions/authorize-case-access';
import type { CaseAccessScope } from '../permissions/resource-access.service';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../permissions/permission.constants';
import { CaseTimelineAccessDeniedError } from './case-timeline.errors';

export const CASE_TIMELINE_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_VIEW_CASE_TIMELINE;

export interface CaseTimelineContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

@Injectable()
export class CaseTimelineOperations {
  private readonly logger = new Logger(CaseTimelineOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<CaseTimelineContext> {
    const auth = request.auth;
    if (!auth) throw new CaseTimelineAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new CaseTimelineAccessDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey: CASE_TIMELINE_PERMISSION,
        operationId: auth.sessionId,
      });
    return {
      sessionId: auth.sessionId,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      actorMembershipId,
    };
  }

  async authorizeCaseAccess(
    request: Request,
  ): Promise<CaseTimelineContext & { scope: CaseAccessScope }> {
    return authorizeCaseAccess(
      request,
      this.permissions,
      CASE_TIMELINE_PERMISSION,
    );
  }

  async run<T>(
    request: Request,
    ctx: CaseTimelineContext,
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
              policy: CASE_TIMELINE_PERMISSION,
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
      if (error instanceof CaseTimelineAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Case timeline operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async read<T>(
    request: Request,
    ctx: CaseTimelineContext,
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

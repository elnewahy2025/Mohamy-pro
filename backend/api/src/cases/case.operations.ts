import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma, type CaseStatus } from '@prisma/client';
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
import { CaseAccessDeniedError } from './case.errors';

export const CASE_PERMISSION: PermissionKey = PERMISSION_KEYS.CAN_MANAGE_CASES;
export const CASE_ASSIGNED_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_ACCESS_ASSIGNED_CASES;

export type CaseAccessScope = 'FULL' | 'ASSIGNED';

export interface CaseAccessContext extends CaseContext {
  scope: CaseAccessScope;
}

export interface CaseContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

@Injectable()
export class CaseOperations {
  private readonly logger = new Logger(CaseOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<CaseContext> {
    return this.authorizeBase(request, CASE_PERMISSION);
  }

  async run<T>(
    request: Request,
    ctx: CaseContext,
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
              policy: CASE_PERMISSION,
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
      if (error instanceof CaseAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Case operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async read<T>(
    request: Request,
    ctx: CaseContext,
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
      if (error instanceof CaseAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Case read failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async requireCaseInTenant(
    transaction: Prisma.TransactionClient,
    ctx: CaseContext,
    caseId: string,
  ): Promise<{ id: string; status: CaseStatus }> {
    const found = await transaction.case.findFirst({
      where: { id: caseId, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!found) throw new CaseAccessDeniedError('NO_CASE_IN_TENANT');
    return found;
  }

  /**
   * Central case-access gate: holders of CanManageCases get FULL scope;
   * otherwise holders of CanAccessAssignedCases get ASSIGNED scope.
   * Authentication failures propagate; only permission denials fall through.
   */
  async authorizeCaseAccess(request: Request): Promise<CaseAccessContext> {
    const base = await this.authorizeBase(request, CASE_PERMISSION).catch(
      (error) => ({ failed: error as Error }),
    );
    if (!('failed' in base)) return { ...base, scope: 'FULL' as const };
    if (
      base.failed.message !== 'UNAUTHENTICATED' &&
      base.failed.message !== 'TENANT_CONTEXT_REQUIRED'
    ) {
      const assigned = await this.authorizeBase(
        request,
        CASE_ASSIGNED_PERMISSION,
      ).catch(() => null);
      if (assigned) return { ...assigned, scope: 'ASSIGNED' as const };
    }
    throw base.failed;
  }

  private async authorizeBase(
    request: Request,
    permissionKey: PermissionKey,
  ): Promise<CaseContext> {
    const auth = request.auth;
    if (!auth) throw new CaseAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new CaseAccessDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey,
        operationId: auth.sessionId,
      });
    return {
      sessionId: auth.sessionId,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      actorMembershipId,
    };
  }

  async requireCaseAssignment(
    transaction: Prisma.TransactionClient,
    ctx: CaseContext,
    caseId: string,
  ): Promise<void> {
    const assignment = await transaction.caseAssignment.findFirst({
      where: {
        caseId,
        membershipId: ctx.actorMembershipId,
        tenantId: ctx.tenantId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!assignment) throw new CaseAccessDeniedError('NO_CASE_ASSIGNMENT');
  }

  async assignedCaseIds(
    transaction: Prisma.TransactionClient,
    ctx: CaseContext,
  ): Promise<string[]> {
    const rows = await transaction.caseAssignment.findMany({
      where: {
        membershipId: ctx.actorMembershipId,
        tenantId: ctx.tenantId,
        revokedAt: null,
      },
      select: { caseId: true },
    });
    return rows.map((row) => row.caseId);
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value.join(',') : value;
    return raw.length === 0 ? null : hashToken(raw);
  }
}

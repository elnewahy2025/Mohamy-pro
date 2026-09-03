import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES, AuditEventType } from '../audit/audit-constants';
import { LegalConfigAccessDeniedError } from './legal-config.errors';
import { PermissionsService } from '../permissions/permissions.service';
import { type PermissionKey } from '../permissions/permission.constants';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';

export interface LegalConfigContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  actorMembershipId: string;
}

@Injectable({ scope: Scope.REQUEST })
export class LegalConfigOperations {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async assertPermission(
    permissionKey: PermissionKey,
  ): Promise<LegalConfigContext> {
    const auth = this.request.auth;
    if (!auth) throw new LegalConfigAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new LegalConfigAccessDeniedError('TENANT_CONTEXT_REQUIRED');

    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request: this.request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey,
        operationId: auth.sessionId,
      });

    return {
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      sessionId: auth.sessionId,
      actorMembershipId,
    };
  }

  /**
   * Helper for auditing configuration changes.
   */
  async auditChange(
    ctx: LegalConfigContext,
    eventType: AuditEventType,
    targetType: string,
    targetId: string,
    outcome: 'SUCCEEDED' | 'DENIED' = 'SUCCEEDED',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.write({
      eventType,
      outcome,
      targetType,
      targetId,
      actorUserId: ctx.userId,
      actorMembershipId: ctx.actorMembershipId,
      tenantId: ctx.tenantId,
      correlationId: getCorrelationId(this.request) || '',
      ipHash: null,
      userAgentHash: null,
      metadata,
    });
  }

  /**
   * Generates the hybrid tenancy query boundary.
   * `tenantId` is either `null` (global dictionary) or matches the active tenant.
   */
  hybridReadWhere(ctx: LegalConfigContext) {
    return {
      OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
    };
  }

  /**
   * Execute Prisma queries within RLS bounds.
   */
  async run<T>(
    ctx: LegalConfigContext,
    operationName: string,
    queryFn: Parameters<PrismaService['withTenantContext']>[1],
  ): Promise<T> {
    try {
      const result = await this.prisma.withTenantContext(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          membershipId: ctx.actorMembershipId,
          operationId: ctx.sessionId,
        },
        queryFn,
      );
      return result as T;
    } catch (error) {
      if (error instanceof Error && error.message.includes('RLS')) {
        throw new LegalConfigAccessDeniedError(
          `Access denied to legal configuration during ${operationName}`,
        );
      }
      throw error;
    }
  }
}

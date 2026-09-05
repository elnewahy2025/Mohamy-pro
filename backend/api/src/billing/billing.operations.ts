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
import { BillingAccessDeniedError } from './billing.errors';

export const BILLING_MANAGE_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_MANAGE_BILLING;
export const BILLING_INVOICE_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_APPROVE_INVOICES;
export const BILLING_PAYMENT_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_RECORD_PAYMENTS;

export interface BillingContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
}

@Injectable()
export class BillingOperations {
  private readonly logger = new Logger(BillingOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(
    request: Request,
    permissionKey: PermissionKey = BILLING_MANAGE_PERMISSION,
  ): Promise<BillingContext> {
    const auth = request.auth;
    if (!auth) throw new BillingAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new BillingAccessDeniedError('TENANT_CONTEXT_REQUIRED');
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

  async run<T>(
    request: Request,
    ctx: BillingContext,
    eventType: AuditEventType,
    targetType: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    metadata?: Record<string, unknown>,
    policy: PermissionKey = BILLING_MANAGE_PERMISSION,
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
              policy,
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
      if (error instanceof BillingAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Billing operation failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async read<T>(
    request: Request,
    ctx: BillingContext,
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

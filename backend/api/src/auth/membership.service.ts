import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../infrastructure/audit/audit.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  TenantContextRequiredError,
  TenantSwitchConflictError,
} from './membership.errors';

export interface TenantSwitchInput {
  sessionId: string;
  userId: string;
  targetTenantId: string;
  correlationId: string;
  expectedContextVersion: number;
  sourceTenantId: string | null;
  sourceMembershipId: string | null;
}

export interface TenantSwitchResult {
  tenantId: string;
  membershipId: string;
  contextVersion: number;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async switchTenant(input: TenantSwitchInput): Promise<TenantSwitchResult> {
    validateInput(input);
    const now = new Date();
    const operationId = randomUUID();
    let stage = 'membership_context';
    try {
      return await this.prisma.withMembershipSelectionContext(
        { userId: input.userId, operationId },
        async (transaction) => {
          stage = 'user_lookup';
          const user = await transaction.user.findUnique({
            where: { id: input.userId },
            select: { id: true, status: true },
          });
          stage = 'membership_lookup';
          const membership = await transaction.membership.findUnique({
            where: {
              userId_tenantId: {
                userId: input.userId,
                tenantId: input.targetTenantId,
              },
            },
            include: { tenant: true },
          });
          stage = 'membership_validation';
          if (
            !user ||
            user.status !== 'ACTIVE' ||
            !membership ||
            membership.status !== 'ACTIVE' ||
            (membership.activeFrom !== null && membership.activeFrom > now) ||
            (membership.activeUntil !== null && membership.activeUntil < now) ||
            membership.tenant.status !== 'ACTIVE'
          ) {
            throw new TenantContextRequiredError();
          }

          stage = 'tenant_context_bind';
          const tenantContext = {
            tenantId: membership.tenantId,
            userId: input.userId,
            membershipId: membership.id,
            operationId,
          };
          await this.prisma.bindTenantContext(transaction, tenantContext);
          stage = 'session_update';
          const updated = await transaction.appSession.updateMany({
            where: {
              id: input.sessionId,
              userId: input.userId,
              status: 'ACTIVE',
              contextVersion: input.expectedContextVersion,
            },
            data: {
              activeTenantId: membership.tenantId,
              activeMembershipId: membership.id,
              contextVersion: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new TenantSwitchConflictError();
          }

          stage = 'session_read';
          const session = await transaction.appSession.findUniqueOrThrow({
            where: { id: input.sessionId },
            select: { contextVersion: true },
          });
          const result = {
            tenantId: membership.tenantId,
            membershipId: membership.id,
            contextVersion: session.contextVersion,
          };
          stage = 'audit_event';
          await this.audit.recordInTransaction(
            {
              eventType: 'tenant.switch.succeeded',
              category: 'AUDIT',
              outcome: 'SUCCEEDED',
              actorUserId: input.userId,
              actorMembershipId: membership.id,
              tenantId: membership.tenantId,
              targetType: 'Tenant',
              targetId: membership.tenantId,
              policy: 'CanSwitchTenant',
              reasonCode: 'membership_active',
              correlationId: input.correlationId,
              metadata: {
                sourceTenantId: input.sourceTenantId,
                targetTenantId: membership.tenantId,
              },
            },
            transaction,
          );
          stage = 'completed';
          return result;
        },
      );
    } catch (error) {
      this.logger.warn(
        `tenant_switch_failed|stage=${safeStage(stage)}|error_class=${safeErrorName(error)}|db_code=${safeDatabaseCode(error)}|driver_code=${safeDriverCode(error)}|driver_boundary=${safeDriverBoundary(error)}`,
      );
      if (error instanceof TenantContextRequiredError) {
        await this.recordDeniedSwitch(input, 'membership_not_eligible');
      } else if (error instanceof TenantSwitchConflictError) {
        await this.recordDeniedSwitch(input, 'stale_session_context');
      }
      throw error;
    }
  }

  async getCurrentContext(
    sessionId: string,
    userId: string,
  ): Promise<TenantSwitchResult | null> {
    validateUuid(sessionId, 'sessionId');
    validateUuid(userId, 'userId');
    return this.prisma.withGlobalOperationContext(
      randomUUID(),
      async (transaction) => {
        const session = await transaction.appSession.findFirst({
          where: { id: sessionId, userId, status: 'ACTIVE' },
          select: {
            activeTenantId: true,
            activeMembershipId: true,
            contextVersion: true,
          },
        });
        if (
          !session ||
          !session.activeTenantId ||
          !session.activeMembershipId
        ) {
          return null;
        }
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });
        await this.prisma.bindMembershipSelectionContext(transaction, {
          userId,
          operationId: randomUUID(),
        });
        const membership = await transaction.membership.findUnique({
          where: {
            id_tenantId: {
              id: session.activeMembershipId,
              tenantId: session.activeTenantId,
            },
          },
          select: {
            userId: true,
            status: true,
            activeFrom: true,
            activeUntil: true,
            tenant: { select: { status: true } },
          },
        });
        await this.prisma.bindGlobalOperationContext(transaction, randomUUID());
        const now = new Date();
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !membership ||
          membership.userId !== userId ||
          membership.status !== 'ACTIVE' ||
          (membership.activeFrom !== null && membership.activeFrom > now) ||
          (membership.activeUntil !== null && membership.activeUntil < now) ||
          membership.tenant.status !== 'ACTIVE'
        ) {
          return null;
        }
        return {
          tenantId: session.activeTenantId,
          membershipId: session.activeMembershipId,
          contextVersion: session.contextVersion,
        };
      },
    );
  }

  private async recordDeniedSwitch(
    input: TenantSwitchInput,
    reasonCode: string,
  ): Promise<void> {
    await this.audit.recordGlobal({
      eventType: 'tenant.switch.denied',
      category: 'SECURITY',
      outcome: 'DENIED',
      actorUserId: input.userId,
      targetType: 'Tenant',
      targetId: input.targetTenantId,
      policy: 'CanSwitchTenant',
      reasonCode,
      correlationId: input.correlationId,
      metadata: {
        sourceTenantId: input.sourceTenantId,
        targetTenantId: input.targetTenantId,
      },
    });
  }
}

function safeStage(value: string): string {
  return /^[a-z_]+$/.test(value) ? value : 'unknown';
}

function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) ? name : 'UnknownError';
}

function safeDatabaseCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'none';
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' && /^P[0-9]{4}$/.test(code) ? code : 'none';
}

function safeDriverCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'none';
  const driver = (error as Record<string, unknown>).driverAdapterError;
  const cause =
    typeof driver === 'object' && driver !== null
      ? (driver as Record<string, unknown>).cause
      : null;
  const originalCode =
    typeof cause === 'object' && cause !== null
      ? (cause as Record<string, unknown>).originalCode
      : null;
  if (typeof originalCode === 'string' && /^[0-9A-Z]{5}$/.test(originalCode)) {
    return originalCode;
  }
  const message = error instanceof Error ? error.message : '';
  const match = message.match(/Database error\. Code:\s*`?([0-9A-Z]{5})`?/i);
  return match?.[1]?.toUpperCase() ?? 'none';
}

function safeDriverBoundary(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/row-level security policy|violates row-level security/i.test(message)) {
    return 'rls_policy';
  }
  if (
    /permission denied for (table|schema|column|sequence|function)/i.test(
      message,
    )
  ) {
    return 'object_privilege';
  }
  if (/permission denied/i.test(message)) return 'permission_other';
  if (/foreign key constraint/i.test(message)) return 'foreign_key';
  if (/violates (a )?check constraint|check constraint/i.test(message)) {
    return 'check_constraint';
  }
  return 'unknown';
}

function validateInput(input: TenantSwitchInput): void {
  validateUuid(input.sessionId, 'sessionId');
  validateUuid(input.userId, 'userId');
  validateUuid(input.targetTenantId, 'targetTenantId');
  validateUuid(input.correlationId, 'correlationId');
  if (
    !Number.isInteger(input.expectedContextVersion) ||
    input.expectedContextVersion < 0
  ) {
    throw new Error('Session context version is invalid');
  }
  if (input.sourceTenantId !== null)
    validateUuid(input.sourceTenantId, 'sourceTenantId');
  if (input.sourceMembershipId !== null) {
    validateUuid(input.sourceMembershipId, 'sourceMembershipId');
  }
}

function validateUuid(value: string, field: string): void {
  if (!UUID_V4_PATTERN.test(value)) throw new Error(`${field} must be UUIDv4`);
}

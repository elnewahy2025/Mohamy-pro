import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  type AuditEvent,
  type AuditCategory,
  type AuditOutcome,
} from '@prisma/client';
import { MetricsService } from '../../observability/metrics.service';
import { PrismaService } from '../database/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

const RETENTION_YEARS = 7;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/;
const SAFE_TEXT_PATTERN = /^[A-Za-z0-9._:-]+$/;

const ALLOWED_EVENT_TYPES = new Set([
  'auth.login.succeeded',
  'privileged.operation.succeeded',
  'auth.logout',
  'auth.session.revoked',
  'auth.session.refresh_failed',
  'identity.suspended',
  'identity.disabled',
  'identity.deleted',
  'tenant.switch.succeeded',
  'tenant.switch.denied',
]);

export interface AuditRecordInput {
  eventType: string;
  eventVersion?: number;
  category: AuditCategory;
  outcome: AuditOutcome;
  actorUserId?: string;
  actorMembershipId?: string;
  tenantId?: string;
  targetType?: string;
  targetId?: string;
  policy?: string;
  reasonCode?: string;
  correlationId: string;
  traceId?: string;
  ipHash?: string;
  userAgentHash?: string;
  metadata: Record<string, string | number | boolean | null | undefined>;
  occurredAt?: Date;
  retentionUntil?: Date;
  legalHold?: boolean;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async recordGlobal(input: AuditRecordInput): Promise<AuditEvent> {
    return this.prisma.withGlobalOperationContext(randomUUID(), (transaction) =>
      this.recordInTransaction(input, transaction),
    );
  }

  async purgeExpired(
    actorUserId: string,
    correlationId: string,
    purposeCode: string,
  ): Promise<number> {
    if (!UUID_V4_PATTERN.test(actorUserId)) {
      throw new Error('Audit purge actor is invalid');
    }
    if (
      !SAFE_TEXT_PATTERN.test(purposeCode) ||
      purposeCode !== 'retention_policy'
    ) {
      throw new Error('Audit purge purpose is invalid');
    }
    try {
      const purged = await this.prisma.withAuditRetentionContext(
        randomUUID(),
        async (transaction) => {
          const now = new Date();
          const eligible = await transaction.auditEvent.count({
            where: {
              retentionUntil: { lte: now },
              legalHold: false,
            },
          });
          await this.recordInTransaction(
            {
              eventType: 'privileged.operation.succeeded',
              category: 'SECURITY',
              outcome: 'SUCCEEDED',
              actorUserId,
              policy: 'AuditRetentionPurge',

              reasonCode: 'retention_elapsed',
              correlationId,
              metadata: { purgedCount: eligible, purposeCode },
            },
            transaction,
          );
          const deleted = await transaction.auditEvent.deleteMany({
            where: {
              retentionUntil: { lte: now },
              legalHold: false,
            },
          });
          return deleted.count;
        },
      );
      this.metrics.recordAuditRetentionPurge('success');
      return purged;
    } catch (error) {
      this.metrics.recordAuditRetentionPurge('failure');
      throw error;
    }
  }

  async recordInTransaction(
    input: AuditRecordInput,
    transaction: Prisma.TransactionClient,
  ): Promise<AuditEvent> {
    const normalized = normalizeInput(input);
    const occurredAt = normalized.occurredAt ?? new Date();
    const retentionUntil =
      normalized.retentionUntil ?? addRetentionYears(occurredAt);
    if (retentionUntil < addRetentionYears(occurredAt)) {
      throw new Error('Audit retention period is shorter than policy');
    }
    const metadata = canonicalMetadata(normalized.metadata);
    const payloadHash = createHash('sha256')
      .update(
        canonicalJson({
          eventType: normalized.eventType,
          eventVersion: normalized.eventVersion,
          category: normalized.category,
          outcome: normalized.outcome,
          actorUserId: normalized.actorUserId,
          actorMembershipId: normalized.actorMembershipId,
          tenantId: normalized.tenantId,
          targetType: normalized.targetType,
          targetId: normalized.targetId,
          policy: normalized.policy,
          reasonCode: normalized.reasonCode,
          correlationId: normalized.correlationId,
          traceId: normalized.traceId,
          ipHash: normalized.ipHash,
          userAgentHash: normalized.userAgentHash,
          metadata,
          occurredAt,
          retentionUntil,
          legalHold: normalized.legalHold ?? false,
        }),
      )
      .digest('hex');
    try {
      if (
        !normalized.tenantId &&
        normalized.eventType === 'auth.login.succeeded'
      ) {
        await this.probeGlobalAuditInsertBoundary(transaction);
      }
      const event = await transaction.auditEvent.create({
        data: {
          id: randomUUID(),
          eventType: normalized.eventType,
          eventVersion: normalized.eventVersion,
          category: normalized.category,
          outcome: normalized.outcome,
          actorUserId: normalized.actorUserId,
          actorMembershipId: normalized.actorMembershipId,
          tenantId: normalized.tenantId,
          targetType: normalized.targetType,
          targetId: normalized.targetId,
          policy: normalized.policy,
          reasonCode: normalized.reasonCode,
          correlationId: normalized.correlationId,
          traceId: normalized.traceId,
          ipHash: normalized.ipHash,
          userAgentHash: normalized.userAgentHash,
          metadata,
          payloadHash,
          occurredAt,
          retentionUntil,
          legalHold: normalized.legalHold ?? false,
        },
      });
      const tenantContext = normalized.tenantId
        ? {
            tenantId: normalized.tenantId,
            userId: normalized.actorUserId as string,
            membershipId: normalized.actorMembershipId as string,
            operationId: await readTransactionOperationId(transaction),
          }
        : undefined;
      await this.outbox.create(
        {
          scope: normalized.tenantId ? 'TENANT' : 'GLOBAL',
          ...(tenantContext ? { tenantContext } : {}),
          aggregateType: 'AuditEvent',
          aggregateId: event.id,
          eventType: normalized.eventType,
          eventVersion: normalized.eventVersion,
          payload: {
            auditEventId: event.id,
            eventType: normalized.eventType,
            eventVersion: normalized.eventVersion,
            outcome: normalized.outcome,
            tenantId: normalized.tenantId ?? null,
            correlationId: normalized.correlationId,
          },
          correlationId: normalized.correlationId,
        },
        transaction,
      );
      this.metrics.recordAuditEvent(
        normalized.eventType,
        normalized.category,
        normalized.outcome,
      );
      return event;
    } catch (error) {
      this.metrics.recordAuditWriteFailure(normalized.category);
      throw error;
    }
  }

  private async probeGlobalAuditInsertBoundary(
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      const [probe] = await transaction.$queryRaw<
        Array<{
          globalOperation: boolean;
          operationIdPresent: boolean;
          tenantIdPresent: boolean;
          auditInsertGranted: boolean;
        }>
      >`
        SELECT
          current_setting('app.global_operation', true) = 'true' AS "globalOperation",
          coalesce(current_setting('app.operation_id', true), '') <> '' AS "operationIdPresent",
          coalesce(current_setting('app.tenant_id', true), '') <> '' AS "tenantIdPresent",
          has_table_privilege(
            current_user,
            'public."AuditEvent"',
            'INSERT'
          ) AS "auditInsertGranted"
      `;
      if (!probe) {
        this.logger.warn(
          'audit_event_preinsert_probe|status=unavailable|reason=empty_result',
        );
        return;
      }
      this.logger.warn(
        `audit_event_preinsert_probe|status=observed|global_operation=${String(probe.globalOperation).toLowerCase()}|operation_id_present=${String(probe.operationIdPresent).toLowerCase()}|tenant_id_present=${String(probe.tenantIdPresent).toLowerCase()}|audit_insert_granted=${String(probe.auditInsertGranted).toLowerCase()}`,
      );
    } catch {
      this.logger.warn(
        'audit_event_preinsert_probe|status=unavailable|reason=query_failed',
      );
    }
  }
}

async function readTransactionOperationId(
  transaction: Prisma.TransactionClient,
): Promise<string> {
  const [context] = await transaction.$queryRaw<
    Array<{ operationId: string | null }>
  >`SELECT current_setting('app.operation_id', true) AS "operationId"`;
  const operationId = context?.operationId;
  if (!operationId || !UUID_V4_PATTERN.test(operationId)) {
    throw new Error('Tenant outbox operation context is unavailable');
  }
  return operationId;
}

function normalizeInput(
  input: AuditRecordInput,
): Required<
  Pick<
    AuditRecordInput,
    | 'eventType'
    | 'eventVersion'
    | 'category'
    | 'outcome'
    | 'correlationId'
    | 'metadata'
  >
> &
  Omit<
    AuditRecordInput,
    | 'eventType'
    | 'eventVersion'
    | 'category'
    | 'outcome'
    | 'correlationId'
    | 'metadata'
  > {
  if (
    !EVENT_TYPE_PATTERN.test(input.eventType) ||
    !ALLOWED_EVENT_TYPES.has(input.eventType)
  ) {
    throw new Error('Audit event type is not allowlisted');
  }
  const eventVersion = input.eventVersion ?? 1;
  if (!Number.isInteger(eventVersion) || eventVersion < 1) {
    throw new Error('Audit event version is invalid');
  }
  if (!UUID_V4_PATTERN.test(input.correlationId)) {
    throw new Error('Audit correlation ID must be UUIDv4');
  }
  for (const [field, value] of [
    ['actorUserId', input.actorUserId],
    ['actorMembershipId', input.actorMembershipId],
    ['tenantId', input.tenantId],
    ['targetId', input.targetId],
  ] as const) {
    if (value !== undefined && !UUID_V4_PATTERN.test(value)) {
      throw new Error(`Audit ${field} is invalid`);
    }
  }
  if (input.tenantId && (!input.actorUserId || !input.actorMembershipId)) {
    throw new Error('Tenant audit events require actor user and membership');
  }
  for (const [field, value] of [
    ['targetType', input.targetType],
    ['policy', input.policy],
    ['reasonCode', input.reasonCode],
    ['traceId', input.traceId],
    ['ipHash', input.ipHash],
    ['userAgentHash', input.userAgentHash],
  ] as const) {
    if (
      value !== undefined &&
      (!value || value.length > 128 || !SAFE_TEXT_PATTERN.test(value))
    ) {
      throw new Error(`Audit ${field} is invalid`);
    }
  }
  return { ...input, eventVersion };
}

function canonicalMetadata(
  metadata: AuditRecordInput['metadata'],
): Prisma.InputJsonValue {
  const allowedKeys = new Set([
    'fromStatus',
    'toStatus',
    'revokedSessionCount',
    'sourceTenantId',
    'targetTenantId',
    'activeMembershipCount',
    'purgedCount',
    'purposeCode',
  ]);
  const entries = Object.entries(metadata)
    .filter(([key]) => allowedKeys.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length !== Object.keys(metadata).length) {
    throw new Error('Audit metadata contains an unknown field');
  }
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of entries) {
    if (value !== undefined) result[key] = value;
  }
  const serialized = JSON.stringify(result);
  if (serialized.length > 65_536)
    throw new Error('Audit metadata is too large');
  return result;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Audit metadata contains a non-finite number');
    return JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('Audit payload contains an unsupported value');
}

function addRetentionYears(date: Date): Date {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + RETENTION_YEARS);
  return result;
}

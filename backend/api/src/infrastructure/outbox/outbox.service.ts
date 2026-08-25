import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, type OutboxMessage } from '@prisma/client';
import { MetricsService } from '../../observability/metrics.service';
import { PrismaService } from '../database/prisma.service';
import {
  assertUuidContextField,
  type TenantTransactionContext,
} from '../database/tenant-context';
import { QueueService } from '../queue/queue.service';

export type OutboxScopeValue = 'GLOBAL' | 'TENANT';

export interface CreateOutboxMessageInput {
  scope: OutboxScopeValue;
  tenantContext?: TenantTransactionContext;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion?: number;
  payload: Prisma.InputJsonValue;
  correlationId?: string;
  traceparent?: string;
}

export interface OutboxJobPayload {
  [key: string]: unknown;
  outboxMessageId: string;
  attempt: number;
  scope: OutboxScopeValue;
  tenantId?: string;
  contextUserId?: string;
  contextMembershipId?: string;
  operationId?: string;
  eventVersion: number;
  correlationId?: string;
  traceparent?: string;
}

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_MS = 60_000;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async create(
    input: CreateOutboxMessageInput,
    transaction: Prisma.TransactionClient,
  ): Promise<OutboxMessage> {
    const data = validateCreateInput(input);
    return transaction.outboxMessage.create({ data });
  }

  async claimBatch(limit = 50): Promise<OutboxMessage[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('Outbox claim limit must be an integer from 1 to 500');
    }

    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - OUTBOX_LEASE_MS);
    const claimed = await this.prisma.withOutboxDispatcherContext(
      randomUUID(),
      async (transaction) => {
        await transaction.outboxMessage.updateMany({
          where: {
            status: 'PROCESSING',
            claimedAt: { lt: leaseCutoff },
            attempts: { gte: OUTBOX_MAX_ATTEMPTS },
          },
          data: {
            status: 'DEAD_LETTER',
            deadLetteredAt: now,
            claimedAt: null,
            leaseToken: null,
            error: 'Processing lease expired after maximum attempts',
          },
        });

        await transaction.outboxMessage.updateMany({
          where: {
            status: 'PROCESSING',
            claimedAt: { lt: leaseCutoff },
            attempts: { lt: OUTBOX_MAX_ATTEMPTS },
          },
          data: {
            status: 'FAILED',
            claimedAt: null,
            leaseToken: null,
            availableAt: now,
            error: 'Processing lease expired; retry scheduled',
          },
        });

        const messages = await transaction.$queryRaw<
          OutboxMessage[]
        >(Prisma.sql`
          SELECT "id", "tenantId", "scope", "aggregateType", "aggregateId", "eventType",
                 "eventVersion", "payload", "correlationId", "traceparent", "contextUserId",
                 "contextMembershipId", "operationId", "status", "error", "attempts",
                 "availableAt", "claimedAt", "leaseToken", "deadLetteredAt", "createdAt",
                 "processedAt"
          FROM "OutboxMessage"
          WHERE "status" IN ('PENDING', 'FAILED')
            AND "availableAt" <= ${now}
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        `);

        const result: OutboxMessage[] = [];
        for (const message of messages) {
          assertStoredOutboxMessage(message);
          const leaseToken = randomUUID();
          const updated = await transaction.outboxMessage.update({
            where: { id: message.id },
            data: {
              status: 'PROCESSING',
              attempts: { increment: 1 },
              claimedAt: now,
              leaseToken,
              error: null,
            },
          });
          result.push(updated);
        }
        return result;
      },
    );
    await this.refreshOutboxMetrics();
    return claimed;
  }

  async dispatchBatch(): Promise<number> {
    const messages = await this.claimBatch();
    for (const message of messages) {
      try {
        await this.queue.enqueue<OutboxJobPayload>(
          'outbox.dispatch',
          toOutboxJobPayload(message),
          { jobId: `outbox-${message.id}-attempt-${message.attempts}` },
        );
      } catch (error) {
        await this.recordFailure(
          message.id,
          error instanceof Error
            ? error.message
            : 'Unknown queue submission error',
          message.leaseToken,
        );
        this.logger.error(
          {
            outboxMessageId: message.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessage:
              error instanceof Error
                ? error.message
                : 'Unknown queue submission error',
          },
          'Outbox queue submission failed',
        );
      }
    }
    await this.refreshOutboxMetrics();
    return messages.length;
  }

  async getById(id: string): Promise<OutboxMessage | null> {
    assertNonEmptyIdentifier(id, 'outboxMessageId');
    return this.prisma.withOutboxDispatcherContext(
      randomUUID(),
      (transaction) => transaction.outboxMessage.findUnique({ where: { id } }),
    );
  }

  async getByJob(job: OutboxJobPayload): Promise<OutboxMessage | null> {
    assertOutboxJobPayload(job);
    const message = await this.getById(job.outboxMessageId);
    if (message && !outboxJobMatchesMessage(job, message)) {
      throw new Error('Outbox job scope does not match the persisted message');
    }
    return message;
  }

  async runInTenantContext<TResult>(
    message: OutboxMessage,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    assertStoredOutboxMessage(message);
    if (message.scope === 'GLOBAL') {
      return this.prisma.withGlobalOperationContext(
        message.operationId ?? randomUUID(),
        callback,
      );
    }
    return this.prisma.withTenantContext(
      {
        tenantId: requiredStoredField(message.tenantId, 'tenantId'),
        userId: requiredStoredField(message.contextUserId, 'contextUserId'),
        membershipId: requiredStoredField(
          message.contextMembershipId,
          'contextMembershipId',
        ),
        operationId: requiredStoredField(message.operationId, 'operationId'),
      },
      callback,
    );
  }

  async markProcessed(id: string, leaseToken: string): Promise<boolean> {
    assertNonEmptyIdentifier(id, 'outboxMessageId');
    assertNonEmptyIdentifier(leaseToken, 'leaseToken');
    const result = await this.prisma.withOutboxDispatcherContext(
      randomUUID(),
      (transaction) =>
        transaction.outboxMessage.updateMany({
          where: { id, status: 'PROCESSING', leaseToken },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            claimedAt: null,
            leaseToken: null,
            error: null,
          },
        }),
    );
    if (result.count === 1) await this.refreshOutboxMetrics();
    return result.count === 1;
  }

  async recordFailure(
    id: string,
    error: string,
    leaseToken?: string | null,
  ): Promise<boolean> {
    assertNonEmptyIdentifier(id, 'outboxMessageId');
    const safeError = error.slice(0, 2_000);
    const result = await this.prisma.withOutboxDispatcherContext(
      randomUUID(),
      async (transaction) => {
        const current = await transaction.outboxMessage.findUnique({
          where: { id },
        });
        if (
          !current ||
          current.status === 'PROCESSED' ||
          current.status === 'DEAD_LETTER'
        ) {
          return { count: 0 };
        }
        if (leaseToken && current.leaseToken !== leaseToken) {
          return { count: 0 };
        }

        const terminal = current.attempts >= OUTBOX_MAX_ATTEMPTS;
        const where = {
          id,
          status: current.status,
          ...(leaseToken ? { leaseToken } : {}),
        };
        if (terminal) {
          return transaction.outboxMessage.updateMany({
            where,
            data: {
              status: 'DEAD_LETTER',
              deadLetteredAt: new Date(),
              claimedAt: null,
              leaseToken: null,
              error: safeError,
            },
          });
        }

        const delayMs = this.retryDelayMs(current.attempts);
        const count = leaseToken
          ? await transaction.$executeRaw`
              UPDATE "OutboxMessage"
              SET "status" = 'FAILED',
                  "availableAt" = CURRENT_TIMESTAMP + (${delayMs}::double precision * INTERVAL '1 millisecond'),
                  "claimedAt" = NULL,
                  "leaseToken" = NULL,
                  "error" = ${safeError}
              WHERE "id" = ${id}
                AND "status" = ${current.status}
                AND "leaseToken" = ${leaseToken}
            `
          : await transaction.$executeRaw`
              UPDATE "OutboxMessage"
              SET "status" = 'FAILED',
                  "availableAt" = CURRENT_TIMESTAMP + (${delayMs}::double precision * INTERVAL '1 millisecond'),
                  "claimedAt" = NULL,
                  "leaseToken" = NULL,
                  "error" = ${safeError}
              WHERE "id" = ${id}
                AND "status" = ${current.status}
            `;
        return { count };
      },
    );
    if (result.count === 1) await this.refreshOutboxMetrics();
    return result.count === 1;
  }

  private async refreshOutboxMetrics(): Promise<void> {
    if (!this.metrics) return;
    const grouped = await this.prisma.withOutboxDispatcherContext(
      randomUUID(),
      (transaction) =>
        transaction.outboxMessage.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
    );
    this.metrics.setOutboxStateCounts(
      Object.fromEntries(
        grouped.map((item) => [item.status, item._count._all]),
      ),
    );
  }

  private retryDelayMs(attempt: number): number {
    const exponential = 1_000 * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(300_000, exponential) + jitter;
  }
}

function validateCreateInput(
  input: CreateOutboxMessageInput,
): Prisma.OutboxMessageCreateInput {
  if (!input.aggregateType.trim() || !input.aggregateId.trim()) {
    throw new Error('Outbox aggregate identity is required');
  }
  if (!input.eventType.trim() || input.eventType.length > 128) {
    throw new Error('Outbox event type is invalid');
  }
  const eventVersion = input.eventVersion ?? 1;
  if (!Number.isInteger(eventVersion) || eventVersion < 1) {
    throw new Error('Outbox event version must be a positive integer');
  }
  if (input.correlationId)
    assertUuidContextField(input.correlationId, 'correlationId');

  if (input.scope === 'TENANT') {
    if (!input.tenantContext) {
      throw new Error(
        'Tenant outbox messages require tenant transaction context',
      );
    }
    const context = input.tenantContext;
    return {
      tenant: { connect: { id: context.tenantId } },
      scope: 'TENANT',
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      eventVersion,
      payload: input.payload,
      correlationId: input.correlationId,
      traceparent: input.traceparent,
      contextUserId: context.userId,
      contextMembershipId: context.membershipId,
      operationId: context.operationId,
    };
  }

  if (input.scope !== 'GLOBAL' || input.tenantContext) {
    throw new Error('Global outbox messages cannot carry tenant context');
  }
  return {
    scope: 'GLOBAL',
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    eventVersion,
    payload: input.payload,
    correlationId: input.correlationId,
    traceparent: input.traceparent,
  };
}

function toOutboxJobPayload(message: OutboxMessage): OutboxJobPayload {
  assertStoredOutboxMessage(message);
  const payload: OutboxJobPayload = {
    outboxMessageId: message.id,
    attempt: message.attempts,
    scope: message.scope,
    eventVersion: message.eventVersion,
    ...(message.correlationId ? { correlationId: message.correlationId } : {}),
    ...(message.traceparent ? { traceparent: message.traceparent } : {}),
  };
  if (message.scope === 'TENANT') {
    payload.tenantId = requiredStoredField(message.tenantId, 'tenantId');
    payload.contextUserId = requiredStoredField(
      message.contextUserId,
      'contextUserId',
    );
    payload.contextMembershipId = requiredStoredField(
      message.contextMembershipId,
      'contextMembershipId',
    );
    payload.operationId = requiredStoredField(
      message.operationId,
      'operationId',
    );
  }
  return payload;
}

export function assertOutboxJobPayload(
  payload: OutboxJobPayload,
): OutboxJobPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Outbox job payload is required');
  }
  assertNonEmptyIdentifier(payload.outboxMessageId, 'outboxMessageId');
  if (!Number.isInteger(payload.attempt) || payload.attempt < 1) {
    throw new Error('Outbox job attempt is invalid');
  }
  if (payload.scope !== 'GLOBAL' && payload.scope !== 'TENANT') {
    throw new Error('Outbox job scope is invalid');
  }
  if (!Number.isInteger(payload.eventVersion) || payload.eventVersion < 1) {
    throw new Error('Outbox job event version is invalid');
  }
  if (payload.scope === 'TENANT') {
    assertUuidContextField(payload.tenantId as string, 'tenantId');
    assertUuidContextField(payload.contextUserId as string, 'contextUserId');
    assertUuidContextField(
      payload.contextMembershipId as string,
      'contextMembershipId',
    );
    assertUuidContextField(payload.operationId as string, 'operationId');
  } else if (
    payload.tenantId ||
    payload.contextUserId ||
    payload.contextMembershipId ||
    payload.operationId
  ) {
    throw new Error('Global outbox job cannot carry tenant context');
  }
  return payload;
}

function outboxJobMatchesMessage(
  job: OutboxJobPayload,
  message: OutboxMessage,
): boolean {
  return (
    job.scope === message.scope &&
    job.eventVersion === message.eventVersion &&
    (job.tenantId ?? null) === message.tenantId &&
    (job.contextUserId ?? null) === message.contextUserId &&
    (job.contextMembershipId ?? null) === message.contextMembershipId &&
    (job.operationId ?? null) === message.operationId
  );
}

function assertStoredOutboxMessage(message: OutboxMessage): void {
  if (message.scope === 'GLOBAL') {
    if (
      message.tenantId ||
      message.contextUserId ||
      message.contextMembershipId ||
      message.operationId
    ) {
      throw new Error('Global outbox message carries tenant context');
    }
    return;
  }
  if (message.scope !== 'TENANT') {
    throw new Error('Persisted outbox message has an invalid scope');
  }
  assertUuidContextField(
    requiredStoredField(message.tenantId, 'tenantId'),
    'tenantId',
  );
  assertUuidContextField(
    requiredStoredField(message.contextUserId, 'contextUserId'),
    'contextUserId',
  );
  assertUuidContextField(
    requiredStoredField(message.contextMembershipId, 'contextMembershipId'),
    'contextMembershipId',
  );
  assertUuidContextField(
    requiredStoredField(message.operationId, 'operationId'),
    'operationId',
  );
}

function requiredStoredField(
  value: string | null | undefined,
  field: string,
): string {
  if (!value) throw new Error(`Outbox message is missing ${field}`);
  return value;
}

function assertNonEmptyIdentifier(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}

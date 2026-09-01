import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, type OutboxMessage } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';
import { MetricsService } from '../../observability/metrics.service';

export interface CreateOutboxMessageInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  /**
   * Server-derived tenant scope for the delivered message. Null denotes a
   * genuinely global operational event. The value is validated and written to
   * the row's tenantId column; OutboxMessage RLS requires a matching context.
   */
  tenantId: string | null;
  payload: Prisma.InputJsonValue;
}

export interface OutboxJobPayload {
  [key: string]: unknown;
  outboxMessageId: string;
  attempt: number;
  /** Server-derived tenant scope carried to the worker; null for global jobs. */
  tenantId: string | null;
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

  create(
    input: CreateOutboxMessageInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<OutboxMessage> {
    const client = transaction ?? this.prisma;
    return client.outboxMessage.create({
      data: {
        tenantId: input.tenantId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload,
      },
    });
  }

  /**
   * Claims and dispatches in the global delivery scope. The claim poll
   * legitimately spans tenants; it runs under the explicit OutboxMessage
   * delivery scope (see the tenant-boundary migration) rather than any tenant
   * context. Per-job processing later re-scopes to the job's tenant.
   */
  async claimBatch(limit = 50): Promise<OutboxMessage[]> {
    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - OUTBOX_LEASE_MS);

    const claimed = await this.prisma.withDeliveryScope(async (transaction) => {
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

      const messages = await transaction.$queryRaw<OutboxMessage[]>(Prisma.sql`
        SELECT "id", "tenantId", "aggregateType", "aggregateId", "eventType", "payload", "status", "error",
               "attempts", "availableAt", "claimedAt", "leaseToken", "deadLetteredAt",
               "createdAt", "processedAt"
        FROM "OutboxMessage"
        WHERE "status" IN ('PENDING', 'FAILED')
          AND "availableAt" <= ${now}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `);

      const claimed: OutboxMessage[] = [];
      for (const message of messages) {
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
        claimed.push(updated);
      }
      return claimed;
    });
    await this.refreshOutboxMetrics();
    return claimed;
  }

  async dispatchBatch(): Promise<number> {
    const messages = await this.claimBatch();
    for (const message of messages) {
      try {
        await this.queue.enqueue<OutboxJobPayload>(
          'outbox.dispatch',
          {
            outboxMessageId: message.id,
            attempt: message.attempts,
            tenantId: message.tenantId,
          },
          { jobId: `outbox-${message.id}-attempt-${message.attempts}` },
        );
      } catch (error) {
        await this.prisma.withDeliveryScope((transaction) =>
          this.recordFailure(
            message.id,
            error instanceof Error
              ? error.message
              : 'Unknown queue submission error',
            message.leaseToken,
            transaction,
          ),
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

  /**
   * Reads a message in the worker's per-job tenant scope (or the delivery scope
   * for global jobs). Pass the transaction opened by the worker so the read is
   * covered by the RLS scope that the subsequent handler and state write use.
   */
  getById(
    id: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<OutboxMessage | null> {
    const client = transaction ?? this.prisma;
    return client.outboxMessage.findUnique({
      where: { id },
    });
  }

  async markProcessed(
    id: string,
    leaseToken: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = transaction ?? this.prisma;
    const result = await client.outboxMessage.updateMany({
      where: { id, status: 'PROCESSING', leaseToken },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        claimedAt: null,
        leaseToken: null,
        error: null,
      },
    });
    if (result.count === 1) await this.refreshOutboxMetrics();
    return result.count === 1;
  }

  async recordFailure(
    id: string,
    error: string,
    leaseToken?: string | null,
    transaction?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = transaction ?? this.prisma;
    const current = await client.outboxMessage.findUnique({
      where: { id },
    });
    if (
      !current ||
      current.status === 'PROCESSED' ||
      current.status === 'DEAD_LETTER'
    ) {
      return false;
    }
    if (leaseToken && current.leaseToken !== leaseToken) {
      return false;
    }

    const safeError = error.slice(0, 2_000);
    const terminal = current.attempts >= OUTBOX_MAX_ATTEMPTS;
    const result = await client.outboxMessage.updateMany({
      where: {
        id,
        status: current.status,
        ...(leaseToken ? { leaseToken } : {}),
      },
      data: terminal
        ? {
            status: 'DEAD_LETTER',
            deadLetteredAt: new Date(),
            claimedAt: null,
            leaseToken: null,
            error: safeError,
          }
        : {
            status: 'FAILED',
            availableAt: new Date(
              Date.now() + this.retryDelayMs(current.attempts),
            ),
            claimedAt: null,
            leaseToken: null,
            error: safeError,
          },
    });
    if (result.count === 1) await this.refreshOutboxMetrics();
    return result.count === 1;
  }

  private async refreshOutboxMetrics(): Promise<void> {
    if (!this.metrics) return;
    const grouped = await this.prisma.withDeliveryScope(async (transaction) =>
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

import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type OutboxMessage } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';

export interface CreateOutboxMessageInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}

export interface OutboxJobPayload {
  [key: string]: unknown;
  outboxMessageId: string;
  attempt: number;
}

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_MS = 60_000;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  create(
    input: CreateOutboxMessageInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<OutboxMessage> {
    const client = transaction ?? this.prisma;
    return client.outboxMessage.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload,
      },
    });
  }

  async claimBatch(limit = 50): Promise<OutboxMessage[]> {
    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - OUTBOX_LEASE_MS);

    return this.prisma.$transaction(async (transaction) => {
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
        SELECT "id", "aggregateType", "aggregateId", "eventType", "payload", "status", "error",
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
          },
          { jobId: `outbox:${message.id}` },
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
    return messages.length;
  }

  getById(id: string): Promise<OutboxMessage | null> {
    return this.prisma.outboxMessage.findUnique({ where: { id } });
  }

  async markProcessed(id: string, leaseToken: string): Promise<boolean> {
    const result = await this.prisma.outboxMessage.updateMany({
      where: { id, status: 'PROCESSING', leaseToken },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        claimedAt: null,
        leaseToken: null,
        error: null,
      },
    });
    return result.count === 1;
  }

  async recordFailure(
    id: string,
    error: string,
    leaseToken?: string | null,
  ): Promise<boolean> {
    const current = await this.prisma.outboxMessage.findUnique({
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
    const result = await this.prisma.outboxMessage.updateMany({
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
    return result.count === 1;
  }

  private retryDelayMs(attempt: number): number {
    const exponential = 1_000 * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(300_000, exponential) + jitter;
  }
}

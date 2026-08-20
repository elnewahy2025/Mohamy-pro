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

  claimBatch(limit = 50): Promise<OutboxMessage[]> {
    return this.prisma.$transaction(async (transaction) => {
      const messages = await transaction.$queryRaw<OutboxMessage[]>(Prisma.sql`
        SELECT "id", "aggregateType", "aggregateId", "eventType", "payload", "status", "error", "createdAt", "processedAt"
        FROM "OutboxMessage"
        WHERE "status" = 'PENDING'
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `);

      if (messages.length > 0) {
        await transaction.outboxMessage.updateMany({
          where: {
            id: { in: messages.map((message) => message.id) },
            status: 'PENDING',
          },
          data: { status: 'PROCESSING' },
        });
      }
      return messages.map((message) => ({ ...message, status: 'PROCESSING' }));
    });
  }

  async dispatchBatch(): Promise<number> {
    const messages = await this.claimBatch();
    for (const message of messages) {
      try {
        await this.queue.enqueue(
          'outbox.dispatch',
          {
            outboxMessageId: message.id,
            eventType: message.eventType,
            aggregateType: message.aggregateType,
            aggregateId: message.aggregateId,
            payload: message.payload,
          },
          { jobId: `outbox:${message.id}` },
        );
        await this.markProcessed(message.id);
      } catch (error) {
        await this.markFailed(
          message.id,
          error instanceof Error ? error.message : 'Unknown dispatch error',
        );
        this.logger.error(
          {
            outboxMessageId: message.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessage:
              error instanceof Error ? error.message : 'Unknown dispatch error',
          },
          'Outbox dispatch failed',
        );
      }
    }
    return messages.length;
  }

  markProcessed(id: string): Promise<OutboxMessage> {
    return this.prisma.outboxMessage.update({
      where: { id },
      data: { status: 'PROCESSED', processedAt: new Date(), error: null },
    });
  }

  markFailed(id: string, error: string): Promise<OutboxMessage> {
    return this.prisma.outboxMessage.update({
      where: { id },
      data: { status: 'FAILED', error },
    });
  }
}

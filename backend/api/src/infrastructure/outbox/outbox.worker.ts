import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { APPLICATION_QUEUE_NAME } from '../queue/queue.service';
import { OutboxService, type OutboxJobPayload } from './outbox.service';
import { OutboxHandlerRegistry } from './outbox-handler.registry';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private worker?: Worker<OutboxJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly outbox: OutboxService,
    private readonly handlers: OutboxHandlerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<OutboxJobPayload>(
      APPLICATION_QUEUE_NAME,
      async (job) => this.process(job),
      {
        connection: this.redis.getClient(),
        concurrency: 10,
        autorun: true,
      },
    );
    this.worker.on('completed', (job) => {
      this.logger.debug(`Completed outbox job ${job.id ?? job.name}`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        {
          jobId: job?.id,
          errorName: error.name,
          errorMessage: error.message,
        },
        'Outbox worker job failed outside the database delivery path',
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(
        { errorName: error.name, errorMessage: error.message },
        'Outbox worker error',
      );
    });
    await this.worker.waitUntilReady();
    this.logger.log(`Outbox worker is ready on ${APPLICATION_QUEUE_NAME}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async process(job: Job<OutboxJobPayload>): Promise<void> {
    const { outboxMessageId } = job.data;
    const message = await this.outbox.getById(outboxMessageId);
    if (!message) {
      throw new Error(`Outbox message ${outboxMessageId} was not found`);
    }

    if (message.status === 'PROCESSED' || message.status === 'DEAD_LETTER') {
      return;
    }

    if (message.status !== 'PROCESSING' || !message.leaseToken) {
      this.logger.warn(
        `Skipping stale outbox job ${job.id ?? outboxMessageId} for message ${outboxMessageId}`,
      );
      return;
    }

    try {
      const handler = this.handlers.resolve(message.eventType);
      await handler(message);
      const marked = await this.outbox.markProcessed(
        message.id,
        message.leaseToken,
      );
      if (!marked) {
        this.logger.warn(
          `Outbox message ${message.id} was not marked processed because its lease changed`,
        );
      }
    } catch (error) {
      await this.outbox.recordFailure(
        message.id,
        error instanceof Error ? error.message : 'Unknown outbox handler error',
        message.leaseToken,
      );
      this.logger.error(
        {
          outboxMessageId: message.id,
          eventType: message.eventType,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Unknown outbox handler error',
        },
        'Outbox handler failed; retry or dead-letter state recorded',
      );
    }
  }
}

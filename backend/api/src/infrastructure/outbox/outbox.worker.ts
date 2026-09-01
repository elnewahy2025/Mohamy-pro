import {
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { Job, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { MetricsService } from '../../observability/metrics.service';
import { RedisService } from '../redis/redis.service';
import { APPLICATION_QUEUE_NAME } from '../queue/queue.service';
import {
  QUEUE_TELEMETRY_FIELD,
  extractQueueTraceContext,
  readQueueTelemetry,
} from '../queue/queue-telemetry';
import { OutboxService, type OutboxJobPayload } from './outbox.service';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { PrismaService } from '../database/prisma.service';

const tracer = trace.getTracer('mohamy-outbox-worker');

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private worker?: Worker<OutboxJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly outbox: OutboxService,
    private readonly handlers: OutboxHandlerRegistry,
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
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
      this.metrics?.recordApplicationError('outbox');
      this.logger.error(
        {
          jobId: job?.id,
          errorName: error.name,
          errorMessage: 'Worker job failed outside the database delivery path',
        },
        'Outbox worker job failed outside the database delivery path',
      );
    });
    this.worker.on('error', (error) => {
      this.metrics?.recordApplicationError('outbox');
      this.logger.error(
        { errorName: error.name, errorMessage: 'Outbox worker error' },
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
    const startedAt = performance.now();
    const telemetry = readQueueTelemetry(job.data[QUEUE_TELEMETRY_FIELD]);
    const parentContext = telemetry?.traceContext
      ? extractQueueTraceContext(ROOT_CONTEXT, telemetry.traceContext)
      : ROOT_CONTEXT;
    const span = tracer.startSpan(
      'outbox.dispatch',
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.operation.type': 'process',
          'messaging.destination.name': APPLICATION_QUEUE_NAME,
          ...(telemetry?.correlationId
            ? { 'mohamy.correlation_id': telemetry.correlationId }
            : {}),
        },
      },
      parentContext,
    );

    return context.with(trace.setSpan(parentContext, span), async () => {
      try {
        await this.processWithinSpan(job, span);
      } catch (error) {
        span.recordException({
          name: error instanceof Error ? error.name : 'UnknownError',
          message: 'Outbox worker execution failed',
        });
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        this.metrics?.observeWorkerJob(job.name, performance.now() - startedAt);
        span.end();
      }
    });
  }

  private async processWithinSpan(
    job: Job<OutboxJobPayload>,
    span: ReturnType<typeof tracer.startSpan>,
  ): Promise<void> {
    const { outboxMessageId, tenantId } = job.data;

    // The worker never trusts a bare aggregate lookup or a process-global value
    // for tenant scope. It scopes the entire per-job handling (message read,
    // handler, and state write) to the validated tenant carried in the job
    // payload, or to the global delivery scope for a registered global job.
    try {
      if (validTenantId(tenantId)) {
        await this.prisma.withWorkerTenantContext(
          tenantId,
          randomUUID(),
          async (transaction) => {
            await this.processMessage(outboxMessageId, transaction);
          },
        );
      } else {
        await this.prisma.withDeliveryScope(async (transaction) => {
          await this.processMessage(outboxMessageId, transaction);
        });
      }
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      // Record the terminal/retry state in the delivery scope so it survives the
      // rollback of the job's tenant-context transaction.
      await this.recordFailureInDeliveryScope(outboxMessageId, error, span);
    }
  }

  /**
   * Processes one outbox message inside the established scope transaction:
   * reads the row, resolves and runs its handler idempotently, then advances
   * the lease to PROCESSED — all within the same transaction/scope.
   */
  private async processMessage(
    outboxMessageId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const message = await this.outbox.getById(outboxMessageId, transaction);
    if (!message) {
      throw new Error(`Outbox message ${outboxMessageId} was not found`);
    }
    if (message.status === 'PROCESSED' || message.status === 'DEAD_LETTER') {
      return;
    }
    if (message.status !== 'PROCESSING' || !message.leaseToken) {
      this.logger.warn(
        `Skipping stale outbox job for message ${outboxMessageId}`,
      );
      return;
    }
    if (!message.tenantId) {
      this.assertGlobalHandler(message.eventType);
    }
    const handler = this.handlers.resolve(message.eventType);
    await handler(message, transaction);
    await this.outbox.markProcessed(
      message.id,
      message.leaseToken,
      transaction,
    );
  }

  private assertGlobalHandler(eventType: string): void {
    if (GLOBAL_OUTBOX_EVENT_TYPES.has(eventType)) {
      return;
    }
    throw new Error(
      `Refusing to process ${eventType} as a global outbox job: ` +
        'the event type is not registered as global',
    );
  }

  private async recordFailureInDeliveryScope(
    outboxMessageId: string,
    error: unknown,
    span: ReturnType<typeof tracer.startSpan>,
  ): Promise<void> {
    this.metrics?.recordApplicationError('outbox');
    span.recordException({
      name: error instanceof Error ? error.name : 'UnknownError',
      message: 'Outbox handler failed',
    });
    span.setStatus({ code: SpanStatusCode.ERROR });
    this.logger.error(
      {
        outboxMessageId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage:
          'Outbox handler failed; retry or dead-letter state recorded',
      },
      'Outbox handler failed; retry or dead-letter state recorded',
    );
    try {
      await this.prisma.withDeliveryScope(async (transaction) => {
        await this.outbox.recordFailure(
          outboxMessageId,
          error instanceof Error
            ? error.message
            : 'Unknown outbox handler error',
          null,
          transaction,
        );
      });
    } catch (failureError) {
      this.logger.error(
        `Failed to record outbox failure for ${outboxMessageId}: ${String(failureError)}`,
      );
    }
  }
}

/** Matches the PostgreSQL tenant-id regex used by the RLS validity functions. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validTenantId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

const GLOBAL_OUTBOX_EVENT_TYPES = new Set<string>(['health.status.updated']);

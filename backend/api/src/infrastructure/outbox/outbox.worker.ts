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
import { MetricsService } from '../../observability/metrics.service';
import { RedisService } from '../redis/redis.service';
import { APPLICATION_QUEUE_NAME } from '../queue/queue.service';
import {
  QUEUE_TELEMETRY_FIELD,
  extractQueueTraceContext,
  readQueueTelemetry,
} from '../queue/queue-telemetry';
import {
  assertOutboxJobPayload,
  OutboxService,
  type OutboxJobPayload,
} from './outbox.service';
import { OutboxHandlerRegistry } from './outbox-handler.registry';

const tracer = trace.getTracer('mohamy-outbox-worker');

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private worker?: Worker<OutboxJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly outbox: OutboxService,
    private readonly handlers: OutboxHandlerRegistry,
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
    const payload = assertOutboxJobPayload(job.data);
    const message = await this.outbox.getByJob(payload);
    if (!message) {
      throw new Error(
        `Outbox message ${payload.outboxMessageId} was not found`,
      );
    }

    if (message.status === 'PROCESSED' || message.status === 'DEAD_LETTER') {
      span.setStatus({ code: SpanStatusCode.OK });
      return;
    }

    if (message.status !== 'PROCESSING' || !message.leaseToken) {
      this.logger.warn(
        `Skipping stale outbox job ${job.id ?? payload.outboxMessageId} for message ${payload.outboxMessageId}`,
      );
      span.setStatus({ code: SpanStatusCode.OK });
      return;
    }

    try {
      const handler = this.handlers.resolve(message.eventType);
      await this.outbox.runInTenantContext(message, (transaction) =>
        handler(message, transaction),
      );
      const marked = await this.outbox.markProcessed(
        message.id,
        message.leaseToken,
      );
      if (!marked) {
        this.logger.warn(
          `Outbox message ${message.id} was not marked processed because its lease changed`,
        );
      }
      span.setStatus({
        code: marked ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      });
    } catch (error) {
      this.metrics?.recordApplicationError('outbox');
      await this.outbox.recordFailure(
        message.id,
        error instanceof Error ? error.message : 'Unknown outbox handler error',
        message.leaseToken,
      );
      span.recordException({
        name: error instanceof Error ? error.name : 'UnknownError',
        message: 'Outbox handler failed',
      });
      span.setStatus({ code: SpanStatusCode.ERROR });
      this.logger.error(
        {
          outboxMessageId: message.id,
          eventType: message.eventType,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage:
            'Outbox handler failed; retry or dead-letter state recorded',
        },
        'Outbox handler failed; retry or dead-letter state recorded',
      );
    }
  }
}

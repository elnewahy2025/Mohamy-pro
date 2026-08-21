import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, type JobsOptions, type Job } from 'bullmq';
import { MetricsService } from '../../observability/metrics.service';
import { attachQueueTelemetry } from './queue-telemetry';
import { RedisService } from '../redis/redis.service';

export const APPLICATION_QUEUE_NAME = 'mohamy-application';

export interface QueuePayload {
  [key: string]: unknown;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue<QueuePayload>;

  constructor(
    redis: RedisService,
    private readonly metrics: MetricsService,
  ) {
    this.queue = new Queue<QueuePayload>(APPLICATION_QUEUE_NAME, {
      connection: redis.getClient(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.waitUntilReady();
    await this.getCounts();
    this.logger.log(`Queue ${APPLICATION_QUEUE_NAME} is ready`);
  }

  async enqueue<T extends QueuePayload>(
    name: string,
    payload: T,
    options?: JobsOptions,
  ): Promise<Job<T>> {
    try {
      const jobPayload = attachQueueTelemetry(payload);
      const job = (await this.queue.add(name, jobPayload, options)) as Job<T>;
      await this.getCounts();
      return job;
    } catch (error) {
      this.metrics.recordApplicationError('queue');
      throw error;
    }
  }

  async getCounts(): Promise<Record<string, number>> {
    try {
      const counts = await this.queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      this.metrics.setQueueDepth(APPLICATION_QUEUE_NAME, counts);
      return counts;
    } catch (error) {
      this.metrics.recordApplicationError('queue');
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

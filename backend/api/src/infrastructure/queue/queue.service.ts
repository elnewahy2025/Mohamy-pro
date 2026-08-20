import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, type JobsOptions, type Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export const APPLICATION_QUEUE_NAME = 'mohamy-application';

export interface QueuePayload {
  [key: string]: unknown;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: Queue<QueuePayload>;

  constructor(redis: RedisService) {
    this.queue = new Queue<QueuePayload>(APPLICATION_QUEUE_NAME, {
      connection: redis.getClient(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.waitUntilReady();
    this.logger.log(`Queue ${APPLICATION_QUEUE_NAME} is ready`);
  }

  async enqueue<T extends QueuePayload>(
    name: string,
    payload: T,
    options?: JobsOptions,
  ): Promise<Job<T>> {
    return this.queue.add(name, payload, options) as Promise<Job<T>>;
  }

  async getCounts(): Promise<Record<string, number>> {
    return this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

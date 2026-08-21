import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { MetricsService } from '../../observability/metrics.service';

interface PrismaQueryEvent {
  duration: number;
  query: string;
}

interface PrismaQueryEventEmitter {
  $on(eventType: 'query', callback: (event: PrismaQueryEvent) => void): void;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly metrics: MetricsService;

  constructor(
    config: ConfigService<ValidatedEnvironment, true>,
    metrics: MetricsService,
  ) {
    const adapter = new PrismaPg(config.getOrThrow('DATABASE_URL'), {
      schema: 'public',
      onPoolError: (error) => {
        loggerForPoolError(error);
        metrics.recordDatabaseError('database');
      },
    });
    super({
      adapter,
      log: [{ emit: 'event', level: 'query' }],
    });
    this.metrics = metrics;
    const queryEvents = this as unknown as PrismaQueryEventEmitter;
    queryEvents.$on('query', (event) => {
      this.metrics.recordDatabaseQuery(
        event.duration,
        databaseOperation(event.query),
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function databaseOperation(query: string): string {
  return query.trim().split(/\s+/, 1)[0] ?? 'other';
}

function loggerForPoolError(error: Error): void {
  console.error(
    JSON.stringify({
      event: 'postgres_pool_error',
      errorName: error.name,
      message: error.message,
      timestamp: new Date().toISOString(),
    }),
  );
}

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../../config/env.validation';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<ValidatedEnvironment, true>) {
    const adapter = new PrismaPg(config.getOrThrow('DATABASE_URL'), {
      schema: 'public',
      onPoolError: (error) => {
        loggerForPoolError(error);
      },
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function loggerForPoolError(error: Error): void {
  console.error(JSON.stringify({
    event: 'postgres_pool_error',
    message: error.message,
    timestamp: new Date().toISOString(),
  }));
}

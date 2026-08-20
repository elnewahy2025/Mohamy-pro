import { Module } from '@nestjs/common';
import { ApplicationConfigModule } from './config/config.module';
import { ApplicationLoggerModule } from './observability/logger.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { OutboxModule } from './infrastructure/outbox/outbox.module';
import { OutboxWorker } from './infrastructure/outbox/outbox.worker';

@Module({
  imports: [
    ApplicationConfigModule,
    ApplicationLoggerModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    OutboxModule,
  ],
  providers: [OutboxWorker],
})
export class WorkerModule {}

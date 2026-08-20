import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ApplicationConfigModule } from './config/config.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApplicationLoggerModule } from './observability/logger.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { OutboxModule } from './infrastructure/outbox/outbox.module';
import { IdempotencyModule } from './infrastructure/idempotency/idempotency.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ApplicationConfigModule,
    ApplicationLoggerModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    QueueModule,
    StorageModule,
    OutboxModule,
    IdempotencyModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

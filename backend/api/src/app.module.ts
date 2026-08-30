import { Module } from '@nestjs/common';
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
import { OutboxDispatcher } from './infrastructure/outbox/outbox.dispatcher';
import { IdempotencyModule } from './infrastructure/idempotency/idempotency.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './observability/metrics.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { RateLimitMiddleware } from './security/rate-limit.middleware';

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
    MetricsModule,
    AuthModule,
    AuditModule,
    BootstrapModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    OutboxDispatcher,
    CorrelationIdMiddleware,
    RateLimitMiddleware,
  ],
})
export class AppModule {}

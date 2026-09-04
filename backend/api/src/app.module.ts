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
import { PermissionsModule } from './permissions/permissions.module';
import { MembershipModule } from './membership/membership.module';
import { OrganizationConfigModule } from './organization-config/organization-config.module';
import { ClientsModule } from './clients/clients.module';
import { ConflictChecksModule } from './conflict-checks/conflict-checks.module';
import { PartiesModule } from './parties/parties.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { RateLimitMiddleware } from './security/rate-limit.middleware';
import { CaseModule } from './cases/case.module';
import { CaseTimelineModule } from './case-timeline/case-timeline.module';
import { LegalConfigModule } from './legal-config/legal-config.module';
import { WorkflowModule } from './workflows/workflow.module';
import { HearingModule } from './hearings/hearing.module';
import { DeadlineModule } from './deadlines/deadline.module';
import { TaskModule } from './tasks/task.module';
import { DocumentModule } from './documents/document.module';
import { SearchModule } from './search/search.module';
import { TemplatesModule } from './templates/templates.module';

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
    PermissionsModule,
    MembershipModule,
    OrganizationConfigModule,
    ClientsModule,
    ConflictChecksModule,
    PartiesModule,
    CaseModule,
    CaseTimelineModule,
    LegalConfigModule,
    WorkflowModule,
    HearingModule,
    DeadlineModule,
    TaskModule,
    DocumentModule,
    SearchModule,
    TemplatesModule,
    SchedulerModule,
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

import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationOperations } from './notification.operations';
import { RuleService } from './rule.service';
import { PreferenceService } from './preference.service';
import { DispatchService } from './dispatch.service';
import { ReminderScheduler } from './reminder.scheduler';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [NotificationController],
  providers: [
    NotificationOperations,
    RuleService,
    PreferenceService,
    DispatchService,
    ReminderScheduler,
  ],
  exports: [DispatchService],
})
export class NotificationModule {}

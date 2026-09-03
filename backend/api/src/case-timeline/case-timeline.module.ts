import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { CaseTimelineOperations } from './case-timeline.operations';
import { CaseTimelineService } from './case-timeline.service';
import { CaseTimelineController } from './case-timeline.controller';

@Module({
  imports: [AuthModule, PermissionsModule, AuditModule],
  controllers: [CaseTimelineController],
  providers: [CaseTimelineOperations, CaseTimelineService],
  exports: [CaseTimelineService],
})
export class CaseTimelineModule {}

import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingOperations } from './reporting.operations';
import { DefinitionService } from './definition.service';
import { RunService } from './run.service';
import { ScheduleService } from './schedule.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [ReportingController],
  providers: [
    ReportingOperations,
    DefinitionService,
    RunService,
    ScheduleService,
  ],
  exports: [RunService],
})
export class ReportingModule {}

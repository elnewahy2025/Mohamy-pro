import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowOperations } from './workflow.operations';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowOperations],
  exports: [WorkflowService, WorkflowOperations],
})
export class WorkflowModule {}

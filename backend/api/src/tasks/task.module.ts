import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskOperations } from './task.operations';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule],
  controllers: [TaskController],
  providers: [TaskService, TaskOperations],
  exports: [TaskService, TaskOperations],
})
export class TaskModule {}

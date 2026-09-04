import { Module } from '@nestjs/common';
import { DeadlineController } from './deadline.controller';
import { DeadlineService } from './deadline.service';
import { DeadlineOperations } from './deadline.operations';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [DeadlineController],
  providers: [DeadlineService, DeadlineOperations],
  exports: [DeadlineService, DeadlineOperations],
})
export class DeadlineModule {}

import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { OpsOperations } from './ops.operations';
import { OpsStatusService } from './status.service';
import { BackupPolicyService } from './policy.service';
import { DrillService } from './drill.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    PermissionsModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [OpsController],
  providers: [
    OpsOperations,
    OpsStatusService,
    BackupPolicyService,
    DrillService,
  ],
})
export class OpsModule {}

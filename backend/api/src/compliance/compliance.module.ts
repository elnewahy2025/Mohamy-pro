import { Module } from '@nestjs/common';
import { ComplianceController } from './compliance.controller';
import { ComplianceOperations } from './compliance.operations';
import { AuditQueryService } from './audit-query.service';
import { RetentionService } from './retention.service';
import { HoldService } from './hold.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [ComplianceController],
  providers: [
    ComplianceOperations,
    AuditQueryService,
    RetentionService,
    HoldService,
  ],
})
export class ComplianceModule {}

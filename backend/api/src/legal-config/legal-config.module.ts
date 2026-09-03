import { Module } from '@nestjs/common';
import { LegalConfigService } from './legal-config.service';
import { LegalConfigController } from './legal-config.controller';
import { LegalConfigOperations } from './legal-config.operations';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [DatabaseModule, AuthModule, AuditModule, PermissionsModule],
  controllers: [LegalConfigController],
  providers: [LegalConfigService, LegalConfigOperations],
  exports: [LegalConfigService],
})
export class LegalConfigModule {}

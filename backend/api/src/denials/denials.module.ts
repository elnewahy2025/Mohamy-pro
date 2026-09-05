import { Module } from '@nestjs/common';
import { DenialController } from './denial.controller';
import { DenialService } from './denial.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [DenialController],
  providers: [DenialService],
  exports: [DenialService],
})
export class DenialsModule {}

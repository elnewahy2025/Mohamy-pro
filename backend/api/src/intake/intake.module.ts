import { Module } from '@nestjs/common';
import { IntakeController } from './intake.controller';
import { IntakeOperations } from './intake.operations';
import { IntakeService } from './intake.service';
import { ConversionService } from './conversion.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [IntakeController],
  providers: [IntakeOperations, IntakeService, ConversionService],
})
export class IntakeModule {}

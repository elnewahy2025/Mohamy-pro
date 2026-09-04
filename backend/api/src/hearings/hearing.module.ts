import { Module } from '@nestjs/common';
import { HearingController } from './hearing.controller';
import { HearingService } from './hearing.service';
import { HearingOperations } from './hearing.operations';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [HearingController],
  providers: [HearingService, HearingOperations],
  exports: [HearingService, HearingOperations],
})
export class HearingModule {}

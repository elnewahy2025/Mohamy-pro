import { Module } from '@nestjs/common';
import { BreakGlassController } from './breakglass.controller';
import { BreakGlassOperations } from './breakglass.operations';
import { BreakGlassService } from './breakglass.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [BreakGlassController],
  providers: [BreakGlassOperations, BreakGlassService],
  exports: [BreakGlassService],
})
export class BreakGlassModule {}

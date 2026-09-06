import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalOperations } from './portal.operations';
import { PortalService } from './portal.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, PermissionsModule, AuthModule],
  controllers: [PortalController],
  providers: [PortalOperations, PortalService],
  exports: [PortalService],
})
export class PortalModule {}

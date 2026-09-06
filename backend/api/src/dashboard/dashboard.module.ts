import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardOperations } from './dashboard.operations';
import { DashboardService } from './dashboard.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, PermissionsModule, AuthModule],
  controllers: [DashboardController],
  providers: [DashboardOperations, DashboardService],
})
export class DashboardModule {}

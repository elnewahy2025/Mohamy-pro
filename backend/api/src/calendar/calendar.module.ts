import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarOperations } from './calendar.operations';
import { ConnectionService } from './connection.service';
import { SyncService } from './sync.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [CalendarController],
  providers: [CalendarOperations, ConnectionService, SyncService],
  exports: [ConnectionService, SyncService],
})
export class CalendarModule {}

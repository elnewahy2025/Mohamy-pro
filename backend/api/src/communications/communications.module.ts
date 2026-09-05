import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller';
import { CommunicationsOperations } from './communications.operations';
import { ThreadService } from './thread.service';
import { MessageService } from './message.service';
import { ConsentService } from './consent.service';
import { DeliveryService } from './delivery.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';
import { CaseTimelineModule } from '../case-timeline/case-timeline.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    PermissionsModule,
    AuthModule,
    CaseTimelineModule,
  ],
  controllers: [CommunicationsController],
  providers: [
    CommunicationsOperations,
    ThreadService,
    MessageService,
    ConsentService,
    DeliveryService,
  ],
  exports: [MessageService, DeliveryService],
})
export class CommunicationsModule {}

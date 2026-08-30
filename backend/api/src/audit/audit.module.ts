import { Global, Module } from '@nestjs/common';
import { AuditEventService } from './audit-event.service';
import { AuditOutboxHandler } from './audit-outbox.handler';

@Global()
@Module({
  providers: [AuditEventService, AuditOutboxHandler],
  exports: [AuditEventService, AuditOutboxHandler],
})
export class AuditModule {}

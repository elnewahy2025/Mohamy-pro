import { Global, Module } from '@nestjs/common';
import { HealthStatusOutboxHandler } from './health-status-outbox.handler';
import { AuditOutboxHandler } from './audit-outbox.handler';
import { OutboxHandlerRegistrar } from './outbox-handler.registrar';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [
    OutboxHandlerRegistry,
    OutboxService,
    HealthStatusOutboxHandler,
    AuditOutboxHandler,
    OutboxHandlerRegistrar,
  ],
  exports: [OutboxHandlerRegistry, OutboxService],
})
export class OutboxModule {}

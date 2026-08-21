import { Global, Module } from '@nestjs/common';
import { HealthStatusOutboxHandler } from './health-status-outbox.handler';
import { OutboxHandlerRegistrar } from './outbox-handler.registrar';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [
    OutboxHandlerRegistry,
    OutboxService,
    HealthStatusOutboxHandler,
    OutboxHandlerRegistrar,
  ],
  exports: [OutboxHandlerRegistry, OutboxService],
})
export class OutboxModule {}

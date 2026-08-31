import { Global, Module } from '@nestjs/common';
import { HealthStatusOutboxHandler } from './health-status-outbox.handler';
import { OutboxHandlerRegistrar } from './outbox-handler.registrar';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { OutboxService } from './outbox.service';
import { InvitationOutboxHandler } from '../../membership/invitation/invitation-outbox.handler';

@Global()
@Module({
  providers: [
    OutboxHandlerRegistry,
    OutboxService,
    HealthStatusOutboxHandler,
    OutboxHandlerRegistrar,
    InvitationOutboxHandler,
  ],
  exports: [OutboxHandlerRegistry, OutboxService],
})
export class OutboxModule {}

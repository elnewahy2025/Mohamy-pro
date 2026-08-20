import { Global, Module } from '@nestjs/common';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxHandlerRegistry, OutboxService],
  exports: [OutboxHandlerRegistry, OutboxService],
})
export class OutboxModule {}

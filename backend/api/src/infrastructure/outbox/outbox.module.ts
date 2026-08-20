import { Global, Module } from '@nestjs/common';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxService, OutboxDispatcher],
  exports: [OutboxService],
})
export class OutboxModule {}

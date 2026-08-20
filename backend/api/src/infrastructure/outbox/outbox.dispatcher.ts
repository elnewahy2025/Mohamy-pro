import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(private readonly outbox: OutboxService) {}

  @Interval(5_000)
  async dispatch(): Promise<void> {
    const count = await this.outbox.dispatchBatch();
    if (count > 0) {
      this.logger.log(`Dispatched ${count} outbox message(s)`);
    }
  }
}

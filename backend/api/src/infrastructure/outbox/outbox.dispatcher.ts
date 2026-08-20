import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(private readonly outbox: OutboxService) {}

  @Interval(5_000)
  async dispatch(): Promise<void> {
    try {
      const count = await this.outbox.dispatchBatch();
      if (count > 0) {
        this.logger.log(
          `Submitted ${count} outbox message(s) to the worker queue`,
        );
      }
    } catch (error) {
      this.logger.error(
        {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown dispatch error',
        },
        'Outbox polling failed; the next interval will retry',
      );
    }
  }
}

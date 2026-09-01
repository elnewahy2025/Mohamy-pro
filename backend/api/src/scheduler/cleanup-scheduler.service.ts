import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyService } from '../infrastructure/idempotency/idempotency.service';

@Injectable()
export class CleanupSchedulerService {
  private readonly logger = new Logger(CleanupSchedulerService.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredIdempotencyKeys(): Promise<void> {
    try {
      const purged = await this.idempotency.purgeExpired();
      if (purged > 0) {
        this.logger.log(`Purged ${purged} expired idempotency keys`);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Unknown cleanup error',
        'Failed to purge expired idempotency keys',
      );
    }
  }
}

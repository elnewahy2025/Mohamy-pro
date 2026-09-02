import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ValidatedEnvironment } from '../config/env.validation';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { IdempotencyService } from '../infrastructure/idempotency/idempotency.service';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class CleanupSchedulerService {
  private readonly logger = new Logger(CleanupSchedulerService.name);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

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
      this.metrics.recordApplicationError('cleanup_idempotency');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredOutboxMessages(): Promise<void> {
    const now = new Date();
    const processedCutoff = new Date(
      now.getTime() -
        this.config.getOrThrow('CLEANUP_OUTBOX_PROCESSED_DAYS') *
          24 *
          60 *
          60 *
          1_000,
    );
    const deadLetterCutoff = new Date(
      now.getTime() -
        this.config.getOrThrow('CLEANUP_OUTBOX_DEAD_LETTER_DAYS') *
          24 *
          60 *
          60 *
          1_000,
    );

    try {
      let purged = 0;
      await this.prisma.withDeliveryScope(async (transaction) => {
        const result = await transaction.outboxMessage.deleteMany({
          where: {
            OR: [
              { status: 'PROCESSED', processedAt: { lt: processedCutoff } },
              {
                status: 'DEAD_LETTER',
                deadLetteredAt: { lt: deadLetterCutoff },
              },
            ],
          },
        });
        purged = result.count;
      });
      if (purged > 0) {
        this.logger.log(`Purged ${purged} expired outbox messages`);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Unknown cleanup error',
        'Failed to purge expired outbox messages',
      );
      this.metrics.recordApplicationError('cleanup_outbox');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredSessions(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        this.config.getOrThrow('CLEANUP_EXPIRED_SESSION_DAYS') *
          24 *
          60 *
          60 *
          1_000,
    );

    try {
      const result = await this.prisma.appSession.deleteMany({
        where: {
          status: { in: ['REVOKED', 'EXPIRED'] },
          absoluteExpiresAt: { lt: cutoff },
        },
      });
      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} expired application sessions`);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Unknown cleanup error',
        'Failed to purge expired application sessions',
      );
      this.metrics.recordApplicationError('cleanup_sessions');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredStorageObjects(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        this.config.getOrThrow('CLEANUP_STORAGE_DAYS') * 24 * 60 * 60 * 1_000,
    );

    try {
      const result = await this.prisma.storageObject.deleteMany({
        where: {
          deletedAt: { lt: cutoff },
          legalHold: false,
        },
      });
      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} expired storage objects`);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Unknown cleanup error',
        'Failed to purge expired storage objects',
      );
      this.metrics.recordApplicationError('cleanup_storage');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredAuditEvents(): Promise<void> {
    try {
      const result = await this.prisma.auditEvent.deleteMany({
        where: {
          retentionUntil: { lt: new Date() },
        },
      });
      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} expired audit events`);
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Unknown cleanup error',
        'Failed to purge expired audit events',
      );
      this.metrics.recordApplicationError('cleanup_audit');
    }
  }
}

import { CleanupSchedulerService } from './cleanup-scheduler.service';
import type { IdempotencyService } from '../infrastructure/idempotency/idempotency.service';
import type { PrismaService } from '../infrastructure/database/prisma.service';
import type { MetricsService } from '../observability/metrics.service';
import type { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';

describe('CleanupSchedulerService', () => {
  let service: CleanupSchedulerService;
  let idempotency: { purgeExpired: jest.Mock };
  let prisma: {
    withDeliveryScope: jest.Mock;
    appSession: { deleteMany: jest.Mock };
    storageObject: { deleteMany: jest.Mock };
    auditEvent: { deleteMany: jest.Mock };
  };
  let metrics: { recordApplicationError: jest.Mock };
  let config: { getOrThrow: jest.Mock };

  const configStub = {
    CLEANUP_OUTBOX_PROCESSED_DAYS: 7,
    CLEANUP_OUTBOX_DEAD_LETTER_DAYS: 30,
    CLEANUP_EXPIRED_SESSION_DAYS: 30,
    CLEANUP_STORAGE_DAYS: 30,
  };

  beforeEach(() => {
    idempotency = { purgeExpired: jest.fn() };
    prisma = {
      withDeliveryScope: jest.fn(),
      appSession: { deleteMany: jest.fn() },
      storageObject: { deleteMany: jest.fn() },
      auditEvent: { deleteMany: jest.fn() },
    };
    metrics = { recordApplicationError: jest.fn() };
    config = {
      getOrThrow: jest.fn((key: string) => (configStub as never)[key]),
    };
    service = new CleanupSchedulerService(
      idempotency as unknown as IdempotencyService,
      prisma as unknown as PrismaService,
      metrics as unknown as MetricsService,
      config as unknown as ConfigService<ValidatedEnvironment, true>,
    );
  });

  it('purges expired idempotency keys on the daily schedule', async () => {
    idempotency.purgeExpired.mockResolvedValue(42);
    await service.purgeExpiredIdempotencyKeys();
    expect(idempotency.purgeExpired).toHaveBeenCalledTimes(1);
  });

  it('swallows and logs failures without throwing', async () => {
    idempotency.purgeExpired.mockRejectedValue(new Error('db down'));
    await expect(
      service.purgeExpiredIdempotencyKeys(),
    ).resolves.toBeUndefined();
  });

  it('purges processed and dead-lettered outbox messages within delivery scope', async () => {
    prisma.withDeliveryScope.mockImplementation(
      async (callback: (tx: unknown) => Promise<{ count: number }>) =>
        callback({
          outboxMessage: {
            deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
          },
        }),
    );
    await service.purgeExpiredOutboxMessages();
    expect(prisma.withDeliveryScope).toHaveBeenCalledTimes(1);
    expect(prisma.withDeliveryScope.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  it('purges expired application sessions', async () => {
    prisma.appSession.deleteMany.mockResolvedValue({ count: 3 });
    await service.purgeExpiredSessions();
    expect(prisma.appSession.deleteMany).toHaveBeenCalledTimes(1);
    expect(config.getOrThrow).toHaveBeenCalledWith(
      'CLEANUP_EXPIRED_SESSION_DAYS',
    );
  });

  it('purges expired storage objects without legal hold', async () => {
    prisma.storageObject.deleteMany.mockResolvedValue({ count: 2 });
    await service.purgeExpiredStorageObjects();
    expect(prisma.storageObject.deleteMany).toHaveBeenCalledTimes(1);
    const where = prisma.storageObject.deleteMany.mock.calls[0][0].where;
    expect(where.legalHold).toBe(false);
  });

  it('purges expired audit events', async () => {
    prisma.auditEvent.deleteMany.mockResolvedValue({ count: 8 });
    await service.purgeExpiredAuditEvents();
    expect(prisma.auditEvent.deleteMany).toHaveBeenCalledTimes(1);
  });
});

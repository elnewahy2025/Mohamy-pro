import { CleanupSchedulerService } from './cleanup-scheduler.service';
import type { IdempotencyService } from '../infrastructure/idempotency/idempotency.service';

describe('CleanupSchedulerService', () => {
  let service: CleanupSchedulerService;
  let idempotency: { purgeExpired: jest.Mock };

  beforeEach(() => {
    idempotency = { purgeExpired: jest.fn() };
    service = new CleanupSchedulerService(idempotency as unknown as IdempotencyService);
  });

  it('purges expired idempotency keys on the daily schedule', async () => {
    idempotency.purgeExpired.mockResolvedValue(42);
    await service.purgeExpiredIdempotencyKeys();
    expect(idempotency.purgeExpired).toHaveBeenCalledTimes(1);
  });

  it('swallows and logs failures without throwing', async () => {
    idempotency.purgeExpired.mockRejectedValue(new Error('db down'));
    await expect(service.purgeExpiredIdempotencyKeys()).resolves.toBeUndefined();
  });
});

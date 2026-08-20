import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn() };
  const queue = { getCounts: jest.fn() };
  const storage = { healthCheck: jest.fn() };
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue('PONG');
    queue.getCounts.mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
    storage.healthCheck.mockResolvedValue(undefined);
    service = new HealthService(
      prisma as never,
      redis as never,
      queue as never,
      storage as never,
    );
  });

  it('reports the process as alive without checking dependencies', () => {
    expect(service.getLiveness()).toMatchObject({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when all dependencies respond', async () => {
    const result = await service.getReadiness();

    expect(result.status).toBe('ok');
    expect(result.checks).toMatchObject({
      postgres: { status: 'up' },
      redis: { status: 'up' },
      queue: { status: 'up' },
      objectStorage: { status: 'up' },
    });
  });

  it('reports degraded readiness without exposing infrastructure error messages', async () => {
    redis.ping.mockRejectedValue(new Error('redis password must not appear in API output'));

    const result = await service.getReadiness();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toMatchObject({ status: 'down', error: 'Error' });
    expect(JSON.stringify(result)).not.toContain('redis password');
  });
});

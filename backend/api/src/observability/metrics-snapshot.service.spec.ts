jest.mock('../infrastructure/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { MetricsSnapshotService } from './metrics-snapshot.service';

describe('MetricsSnapshotService', () => {
  const metrics = {
    setQueueDepth: jest.fn(),
    setOutboxStateCounts: jest.fn(),
  };
  const queue = {
    getCounts: jest.fn(),
  };
  const outboxGroupBy = jest.fn();
  const prisma = {
    withOutboxDispatcherContext: jest.fn(),
  };
  let service: MetricsSnapshotService;

  beforeEach(() => {
    jest.clearAllMocks();
    queue.getCounts.mockResolvedValue({
      waiting: 2,
      active: 1,
      completed: 8,
      failed: 0,
      delayed: 0,
    });
    outboxGroupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'PROCESSED', _count: { _all: 8 } },
    ]);
    prisma.withOutboxDispatcherContext.mockImplementation(
      (_operationId: string, callback: (transaction: unknown) => unknown) =>
        Promise.resolve(
          callback({ outboxMessage: { groupBy: outboxGroupBy } }),
        ),
    );
    service = new MetricsSnapshotService(
      metrics as never,
      prisma as never,
      queue as never,
    );
  });

  it('refreshes outbox metrics through the dispatcher context', async () => {
    await service.refresh();

    expect(prisma.withOutboxDispatcherContext).toHaveBeenCalledTimes(1);
    const [operationId] = prisma.withOutboxDispatcherContext.mock.calls[0];
    expect(operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(outboxGroupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: { _all: true },
    });
    expect(metrics.setOutboxStateCounts).toHaveBeenCalledWith({
      PENDING: 2,
      PROCESSED: 8,
    });
  });
});

import { OpsStatusService } from './status.service';
import { BackupPolicyService } from './policy.service';
import { DrillService } from './drill.service';

describe('OpsStatusService', () => {
  it('aggregates real signals without inventing numbers', async () => {
    const tx = {
      outboxMessage: {
        groupBy: jest.fn().mockImplementation(({ where }: any) => {
          if (where.tenantId === 't1') {
            return Promise.resolve([
              { status: 'PENDING', _count: { _all: 2 } },
            ]);
          }
          return Promise.resolve([
            { status: 'PROCESSED', _count: { _all: 40 } },
          ]);
        }),
      },
    };
    const health = {
      getReadiness: jest.fn().mockResolvedValue({
        status: 'ok',
        timestamp: '2026-01-01T00:00:00.000Z',
        checks: {},
      }),
    };
    const policies = { get: jest.fn().mockResolvedValue(null) };
    const drills = {
      latest: jest.fn().mockResolvedValue({
        id: 'd1',
        name: 'Q1 drill',
        status: 'PASSED',
        finishedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    };
    const service = new OpsStatusService(
      health as never,
      policies as unknown as BackupPolicyService,
      drills as unknown as DrillService,
    );

    const status = await service.status(tx as any, 't1');

    expect(status.health).toMatchObject({ status: 'ok' });
    expect(status.outbox.mine).toEqual({ PENDING: 2 });
    expect(status.outbox.globalPool).toEqual({ PROCESSED: 40 });
    expect(status.backupPolicy).toEqual({ configured: false, enabled: null });
    expect(status.latestDrill).toMatchObject({ id: 'd1', status: 'PASSED' });
  });
});

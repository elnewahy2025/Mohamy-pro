import { DrillService } from './drill.service';
import { OpsInvalidStateError, OpsNotFoundError } from './ops.errors';

describe('DrillService', () => {
  it('finishes planned drills with recorded checks', async () => {
    const tx = {
      restoreDrill: {
        findFirst: jest.fn().mockResolvedValue({ id: 'd1', status: 'PLANNED' }),
        update: jest.fn().mockImplementation(({ data }: any) => ({ ...data })),
      },
    };
    const service = new DrillService();

    const updated: any = await service.finish(tx as any, 't1', 'm1', 'd1', {
      passed: true,
      checks: [{ name: 'restore', passed: true, evidence: 'branch ok' }],
    } as any);

    expect(tx.restoreDrill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_tenantId: { id: 'd1', tenantId: 't1' } },
      }),
    );
    expect(updated.status).toBe('PASSED');
    expect(updated.finishedBy).toBe('m1');
  });

  it('rejects passed verdicts with failing checks', async () => {
    const tx = {
      restoreDrill: {
        findFirst: jest.fn().mockResolvedValue({ id: 'd1', status: 'PLANNED' }),
        update: jest.fn(),
      },
    };
    const service = new DrillService();

    await expect(
      service.finish(tx as any, 't1', 'm1', 'd1', {
        passed: true,
        checks: [{ name: 'restore', passed: false, evidence: 'broken' }],
      } as any),
    ).rejects.toBeInstanceOf(OpsInvalidStateError);
    expect(tx.restoreDrill.update).not.toHaveBeenCalled();
  });

  it('finishes settled drills never twice', async () => {
    const tx = {
      restoreDrill: {
        findFirst: jest.fn().mockResolvedValue({ id: 'd1', status: 'PASSED' }),
        update: jest.fn(),
      },
    };
    const service = new DrillService();

    await expect(
      service.finish(tx as any, 't1', 'm1', 'd1', {
        passed: false,
        checks: [{ name: 'restore', passed: false, evidence: 'x' }],
      } as any),
    ).rejects.toBeInstanceOf(OpsInvalidStateError);
  });

  it('throws not-found for missing drills', async () => {
    const tx = {
      restoreDrill: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new DrillService();

    await expect(
      service.finish(tx as any, 't1', 'm1', 'missing', {
        passed: false,
        checks: [{ name: 'x', passed: false, evidence: 'y' }],
      } as any),
    ).rejects.toBeInstanceOf(OpsNotFoundError);
  });
});

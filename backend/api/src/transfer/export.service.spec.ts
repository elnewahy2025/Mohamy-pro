import { ExportService } from './export.service';
import { TransferInvalidStateError } from './transfer.errors';

describe('ExportService', () => {
  it('rejects XLSX and oversized requests at create time', async () => {
    const tx = {
      exportJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const svc = new ExportService();

    await expect(
      svc.create(tx as any, 't1', 'u1', {
        entityType: 'CASE',
        format: 'XLSX',
        idempotencyKey: 'k1',
      } as any),
    ).rejects.toBeInstanceOf(TransferInvalidStateError);
    await expect(
      svc.create(tx as any, 't1', 'u1', {
        entityType: 'CASE',
        maxRows: 99999,
        idempotencyKey: 'k2',
      } as any),
    ).rejects.toBeInstanceOf(TransferInvalidStateError);
    expect(tx.exportJob.create).not.toHaveBeenCalled();
  });

  it('generates watermarked allowlisted CSV and completes', async () => {
    const tx = {
      exportJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          status: 'QUEUED',
          entityType: 'CASE',
          maxRows: 5000,
        }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
      case: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            caseNumber: 'C-1',
            tenantId: 't1',
            tokenHash: 'must-never-leak',
          },
        ]),
      },
    };
    const svc = new ExportService();

    const csv = await svc.generate(tx as any, 't1', 'e1');

    expect(csv).toContain('job=e1');
    expect(csv).toContain('C-1');
    expect(csv).not.toContain('must-never-leak');
    expect(tx.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', rowCount: 1 }),
      }),
    );
  });

  it('refuses download of unready or expired exports', async () => {
    const svc = new ExportService();
    const running = {
      exportJob: {
        findFirst: jest.fn().mockResolvedValue({ id: 'e1', status: 'RUNNING' }),
        update: jest.fn(),
      },
    };
    await expect(
      svc.download(running as any, 't1', 'e1'),
    ).rejects.toBeInstanceOf(TransferInvalidStateError);

    const expiredTx = {
      exportJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          status: 'COMPLETED',
          entityType: 'CASE',
          maxRows: 5000,
          expiresAt: new Date(Date.now() - 1000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    await expect(
      svc.download(expiredTx as any, 't1', 'e1'),
    ).rejects.toBeInstanceOf(TransferInvalidStateError);
    expect(expiredTx.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });
});

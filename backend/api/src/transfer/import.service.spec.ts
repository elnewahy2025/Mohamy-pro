import { ImportService } from './import.service';
import {
  TransferInvalidStateError,
  TransferNotFoundError,
} from './transfer.errors';

function service() {
  const redis = { getClient: jest.fn() } as never;
  return new ImportService(redis as never);
}

describe('ImportService', () => {
  it('rejects XLSX at create time (fail-closed)', async () => {
    const tx = { importJob: { findFirst: jest.fn() } };
    const svc = service();

    await expect(
      svc.create(tx as any, 't1', 'u1', {
        entityType: 'CASE',
        format: 'XLSX',
        idempotencyKey: 'k1',
      } as any),
    ).rejects.toBeInstanceOf(TransferInvalidStateError);
  });

  it('replays the existing job for a duplicate idempotency key', async () => {
    const existing = { id: 'j1', status: 'COMPLETED' };
    const tx = {
      importJob: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const svc = service();

    const result = await svc.create(tx as any, 't1', 'u1', {
      entityType: 'CASE',
      idempotencyKey: 'k1',
    } as any);

    expect(result).toEqual(existing);
    expect(tx.importJob.create).not.toHaveBeenCalled();
  });

  it('validates rows, records errors, and counts precisely', async () => {
    const tx = {
      importJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j1',
          status: 'DRAFT',
          entityType: 'CASE',
          content:
            'caseNumber,clientId\nC-1,11111111-1111-4111-8111-111111111111\nC-1,22222222-2222-4222-8222-222222222222\n',
        }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
      importRowError: { deleteMany: jest.fn(), create: jest.fn() },
      case: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'existing' }),
      },
      client: { findFirst: jest.fn().mockResolvedValue({ id: 'cl' }) },
    };
    const svc = service();

    const updated: any = await svc.validate(tx as any, 't1', 'j1');

    expect(updated.status).toBe('VALIDATED');
    expect(updated.totalRows).toBe(2);
    expect(updated.validRows).toBe(1);
    expect(updated.errorRows).toBe(1);
    expect(tx.importRowError.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rowNumber: 3 }),
      }),
    );
  });

  it('enforces the two-person approval rule', async () => {
    const tx = {
      importJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j1',
          status: 'VALIDATED',
          requestedBy: 'u1',
        }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const svc = service();

    await expect(
      svc.approve(tx as any, 't1', 'u1', 'j1', {}),
    ).rejects.toBeInstanceOf(TransferInvalidStateError);
  });

  it('rolls back by deleting recorded creations tenant-scoped', async () => {
    const tx = {
      importJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'j1',
          status: 'COMPLETED',
          resultSummary: { createdIds: [{ entity: 'CASE', id: 'c9' }] },
        }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
      case: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      client: { deleteMany: jest.fn() },
      party: { deleteMany: jest.fn() },
      task: { deleteMany: jest.fn() },
    };
    const svc = service();

    const rolled: any = await svc.rollback(tx as any, 't1', 'j1');

    expect(rolled.status).toBe('ROLLED_BACK');
    expect(tx.case.deleteMany).toHaveBeenCalledWith({
      where: { id: 'c9', tenantId: 't1' },
    });
  });

  it('requires completed status for rollback and approved status for run', async () => {
    const tx = {
      importJob: {
        findFirst: jest.fn().mockResolvedValue({ id: 'j1', status: 'DRAFT' }),
        update: jest.fn(),
      },
    };
    const svc = service();

    await expect(svc.rollback(tx as any, 't1', 'j1')).rejects.toBeInstanceOf(
      TransferInvalidStateError,
    );
    const draftTx = {
      importJob: {
        findFirst: jest.fn().mockResolvedValue({ id: 'j1', status: 'DRAFT' }),
      },
    };
    await expect(
      svc.runJob(draftTx as never, 't1', 'j1'),
    ).rejects.toBeInstanceOf(TransferInvalidStateError);
    const missing = {
      importJob: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      svc.validate(missing as any, 't1', 'missing'),
    ).rejects.toBeInstanceOf(TransferNotFoundError);
  });
});

import { Prisma } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  it('computes outstanding across payments and credit applications', async () => {
    const tx = {
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'inv1', total: '100.0000' }),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([{ amount: '60.0000' }]),
      },
      creditApplication: {
        findMany: jest.fn().mockResolvedValue([{ amount: '10.0000' }]),
      },
    };
    const service = new ReconciliationService();

    const result = await service.outstanding(tx as any, 't1', 'inv1');

    expect(result.total.toString()).toBe('100');
    expect(result.paid.toString()).toBe('70');
    expect(result.outstanding.toString()).toBe('30');
    expect(new Prisma.Decimal('0.1').plus('0.2').toString()).toBe('0.3');
  });

  it('marks fully covered invoices PAID and partial ones PARTIALLY_PAID', async () => {
    const service = new ReconciliationService();
    const update = jest.fn();

    const paidTx = {
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'inv1', total: '100.0000' })
          .mockResolvedValueOnce({ id: 'inv1', status: 'ISSUED' }),
        update,
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([{ amount: '100.0000' }]),
      },
      creditApplication: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await service.refreshInvoiceStatus(paidTx as any, 't1', 'inv1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { status: 'PAID' },
    });

    const partialTx = {
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'inv2', total: '100.0000' })
          .mockResolvedValueOnce({ id: 'inv2', status: 'ISSUED' }),
        update,
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([{ amount: '40.0000' }]),
      },
      creditApplication: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await service.refreshInvoiceStatus(partialTx as any, 't1', 'inv2');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'inv2' },
      data: { status: 'PARTIALLY_PAID' },
    });
  });
});

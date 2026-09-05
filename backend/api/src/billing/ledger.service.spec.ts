import { Prisma } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { BillingInvalidStateError } from './billing.errors';

describe('LedgerService', () => {
  it('posts balanced debit/credit lines', async () => {
    const tx = { ledgerEntry: { createMany: jest.fn() } };
    const service = new LedgerService();

    await service.postBalanced(tx as any, 't1', 'txn1', [
      { side: 'DEBIT', amount: '100.0000' },
      { side: 'CREDIT', amount: 100 },
    ]);

    expect(tx.ledgerEntry.createMany).toHaveBeenCalledTimes(1);
    expect(
      (tx.ledgerEntry.createMany as jest.Mock).mock.calls[0][0].data,
    ).toHaveLength(2);
  });

  it('rejects unbalanced, empty, and negative postings', async () => {
    const tx = { ledgerEntry: { createMany: jest.fn() } };
    const service = new LedgerService();

    await expect(
      service.postBalanced(tx as any, 't1', 'txn1', [
        { side: 'DEBIT', amount: '100.0000' },
        { side: 'CREDIT', amount: '99.9999' },
      ]),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);
    await expect(
      service.postBalanced(tx as any, 't1', 'txn1', []),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);
    await expect(
      service.postBalanced(tx as any, 't1', 'txn1', [
        { side: 'DEBIT', amount: '-5' },
        { side: 'CREDIT', amount: '-5' },
      ]),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
    expect(new Prisma.Decimal('0.1').plus('0.2').toString()).toBe('0.3');
  });
});

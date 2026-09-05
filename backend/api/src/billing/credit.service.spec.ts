import { Prisma } from '@prisma/client';
import { CreditService } from './credit.service';
import { BillingInvalidStateError } from './billing.errors';

function service() {
  const ledger = { postBalanced: jest.fn() };
  const reconciliation = {
    outstanding: jest.fn(),
    refreshInvoiceStatus: jest.fn(),
  };
  return {
    ledger,
    reconciliation,
    svc: new CreditService(ledger as any, reconciliation as any),
  };
}

describe('CreditService', () => {
  it('caps application at the open credit balance', async () => {
    const tx = {
      credit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cr1',
          amount: '50.0000',
          appliedAmount: '20.0000',
          currency: 'EGP',
        }),
        update: jest.fn(),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'cr1' }),
      },
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'inv1', status: 'ISSUED' }),
      },
      creditApplication: { create: jest.fn() },
    };
    const { svc } = service();

    await expect(
      svc.apply(tx as any, 't1', 'cr1', {
        invoiceId: 'inv1',
        amount: 40,
      } as any),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);
    expect(tx.creditApplication.create).not.toHaveBeenCalled();
  });

  it('records the application row when within balance', async () => {
    const tx = {
      credit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cr1',
          amount: '50.0000',
          appliedAmount: '20.0000',
          currency: 'EGP',
        }),
        update: jest.fn(),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'cr1' }),
      },
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'inv1', status: 'ISSUED' }),
      },
      creditApplication: { create: jest.fn() },
    };
    const { svc, reconciliation } = service();
    (reconciliation.outstanding as jest.Mock).mockResolvedValue({
      total: new Prisma.Decimal(100),
      paid: new Prisma.Decimal(0),
      outstanding: new Prisma.Decimal(100),
    });

    await svc.apply(tx as any, 't1', 'cr1', {
      invoiceId: 'inv1',
      amount: 20,
    } as any);

    expect(tx.creditApplication.create).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        creditId: 'cr1',
        invoiceId: 'inv1',
        amount: expect.anything(),
      },
    });
    expect(tx.credit.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: expect.objectContaining({ status: 'APPLIED' }),
    });
  });
});

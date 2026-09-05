import { Prisma } from '@prisma/client';
import { PaymentService } from './payment.service';
import { BillingInvalidStateError } from './billing.errors';

function service() {
  const ledger = { postBalanced: jest.fn() };
  const reconciliation = {
    outstanding: jest.fn().mockResolvedValue({
      total: new Prisma.Decimal(100),
      paid: new Prisma.Decimal(0),
      outstanding: new Prisma.Decimal(100),
    }),
    refreshInvoiceStatus: jest.fn(),
  };
  const timeline = { recordEvent: jest.fn() };
  return {
    ledger,
    reconciliation,
    timeline,
    svc: new PaymentService(
      ledger as any,
      reconciliation as any,
      timeline as any,
    ),
  };
}

describe('PaymentService', () => {
  it('replays the existing payment for a duplicate idempotency key', async () => {
    const existing = { id: 'p1', status: 'SUCCEEDED' };
    const tx = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const { svc, ledger } = service();

    const result = await svc.record(tx as any, 't1', 'u1', 'm1', {
      invoiceId: 'inv1',
      amount: 100,
      idempotencyKey: 'key-1',
    } as any);

    expect(result).toEqual(existing);
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(ledger.postBalanced).not.toHaveBeenCalled();
  });

  it('rejects payments on non-payable invoices and overpayments', async () => {
    const { svc } = service();
    const draftTx = {
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      invoice: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inv1', status: 'DRAFT' }),
      },
    };
    await expect(
      svc.record(draftTx as any, 't1', 'u1', 'm1', {
        invoiceId: 'inv1',
        amount: 10,
        idempotencyKey: 'key-2',
      } as any),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);
  });

  it('records payment, posts ledger, and emits the payment event', async () => {
    const tx = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'p1',
          currency: 'EGP',
          providerRef: null,
          ...data,
        })),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv1',
          status: 'ISSUED',
          caseId: 'c1',
          currency: 'EGP',
        }),
      },
    };
    const { svc, ledger, timeline, reconciliation } = service();

    (reconciliation.outstanding as jest.Mock).mockResolvedValue({
      total: new Prisma.Decimal(100),
      paid: new Prisma.Decimal(0),
      outstanding: new Prisma.Decimal(100),
    });

    const payment: any = await svc.record(tx as any, 't1', 'u1', 'm1', {
      invoiceId: 'inv1',
      amount: 100,
      idempotencyKey: 'key-3',
    } as any);

    expect(payment.id).toBe('p1');
    expect(ledger.postBalanced).toHaveBeenCalledTimes(1);
    expect(reconciliation.refreshInvoiceStatus).toHaveBeenCalledWith(
      tx,
      't1',
      'inv1',
    );
    expect(timeline.recordEvent).toHaveBeenCalledWith(
      tx,
      't1',
      'u1',
      'm1',
      expect.objectContaining({ caseId: 'c1', eventType: 'PAYMENT_RECEIVED' }),
    );
  });
});

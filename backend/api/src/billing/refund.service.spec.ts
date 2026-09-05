import { RefundService } from './refund.service';
import { BillingInvalidStateError } from './billing.errors';

function service() {
  const ledger = { postBalanced: jest.fn() };
  const reconciliation = { refreshInvoiceStatus: jest.fn() };
  return {
    ledger,
    reconciliation,
    svc: new RefundService(ledger as any, reconciliation as any),
  };
}

describe('RefundService', () => {
  it('caps refunds at the unrefunded payment remainder', async () => {
    const tx = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          status: 'SUCCEEDED',
          amount: '100.0000',
          currency: 'EGP',
          invoiceId: 'inv1',
          refunds: [{ amount: '70.0000' }],
        }),
      },
      refund: { create: jest.fn() },
    };
    const { svc } = service();

    await expect(
      svc.issue(tx as any, 't1', { paymentId: 'p1', amount: 40 } as any),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('marks the payment REFUNDED on full remainder refund', async () => {
    const tx = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          status: 'SUCCEEDED',
          amount: '100.0000',
          currency: 'EGP',
          invoiceId: 'inv1',
          refunds: [{ amount: '70.0000' }],
        }),
        update: jest.fn(),
      },
      refund: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'r1',
          ...data,
        })),
      },
    };
    const { svc, reconciliation } = service();

    const refund: any = await svc.issue(tx as any, 't1', {
      paymentId: 'p1',
      amount: 30,
    } as any);

    expect(refund.id).toBe('r1');
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'REFUNDED' },
    });
    expect(reconciliation.refreshInvoiceStatus).toHaveBeenCalledWith(
      tx,
      't1',
      'inv1',
    );
  });
});

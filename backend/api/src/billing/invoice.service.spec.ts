import { InvoiceService } from './invoice.service';
import { LedgerService } from './ledger.service';
import { BillingInvalidStateError } from './billing.errors';

function service() {
  const ledger = { postBalanced: jest.fn() };
  const timeline = { recordEvent: jest.fn() };
  const dispatch = { dispatch: jest.fn().mockResolvedValue(0) };
  return {
    ledger,
    timeline,
    dispatch,
    svc: new InvoiceService(ledger as any, timeline as any, dispatch as any),
  };
}

const billedEntry = {
  id: 'te1',
  status: 'APPROVED',
  rateAmount: '100.0000',
  durationMinutes: 60,
  description: 'Review',
};

describe('InvoiceService', () => {
  it('builds lines with exact decimal totals and marks time invoiced', async () => {
    const tx = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue(billedEntry),
        updateMany: jest.fn(),
      },
      invoice: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'inv1',
          ...data,
          lines: data.lines.create,
        })),
      },
    };
    const { svc } = service();

    const created: any = await svc.create(tx as any, 't1', 'u1', 'm1', {
      caseId: 'c1',
      invoiceNumber: 'INV-001',
      timeEntryIds: ['te1'],
    } as any);

    expect(created.subtotal.toString()).toBe('100');
    expect(created.total.toString()).toBe('100');
    expect(created.lines).toHaveLength(1);
    expect(created.lines[0].lineTotal.toString()).toBe('100');
    expect(tx.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['te1'] }, tenantId: 't1' },
      data: { status: 'INVOICED' },
    });
  });

  it('rejects unapproved time, unrated time, and empty invoices', async () => {
    const { svc } = service();
    const baseTx = {
      timeEntry: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      invoice: { create: jest.fn() },
    };

    (baseTx.timeEntry.findFirst as jest.Mock).mockResolvedValue({
      ...billedEntry,
      status: 'DRAFT',
    });
    await expect(
      svc.create(txOf(baseTx), 't1', 'u1', 'm1', {
        invoiceNumber: 'INV-002',
        timeEntryIds: ['te1'],
      } as any),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);

    (baseTx.timeEntry.findFirst as jest.Mock).mockResolvedValue({
      ...billedEntry,
      rateAmount: null,
    });
    await expect(
      svc.create(txOf(baseTx), 't1', 'u1', 'm1', {
        invoiceNumber: 'INV-003',
        timeEntryIds: ['te1'],
      } as any),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);

    await expect(
      svc.create(txOf(baseTx), 't1', 'u1', 'm1', {
        invoiceNumber: 'INV-004',
      } as any),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);

    function txOf(t: any) {
      return t as any;
    }
  });

  it('issues post ledger lines and emits the invoice timeline event', async () => {
    const tx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv1',
          status: 'DRAFT',
          total: '100.0000',
          currency: 'EGP',
          caseId: 'c1',
        }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'inv1',
          caseId: 'c1',
          invoiceNumber: 'INV-001',
          currency: 'EGP',
          total: '100.0000',
          ...data,
        })),
      },
    };
    const { ledger, timeline, svc } = service();

    const issued: any = await svc.issue(tx as any, 't1', 'u1', 'm1', 'inv1');

    expect(issued.status).toBe('ISSUED');
    expect(ledger.postBalanced).toHaveBeenCalledTimes(1);
    const [, , , lines] = (ledger.postBalanced as jest.Mock).mock.calls[0];
    expect(lines).toHaveLength(2);
    expect(timeline.recordEvent).toHaveBeenCalledWith(
      tx,
      't1',
      'u1',
      'm1',
      expect.objectContaining({ caseId: 'c1', eventType: 'INVOICE_CREATED' }),
    );
  });

  it('dispatches invoice notifications best-effort without failing issue', async () => {
    const tx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv1',
          status: 'DRAFT',
          total: '100.0000',
          currency: 'EGP',
          caseId: 'c1',
        }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'inv1',
          caseId: 'c1',
          invoiceNumber: 'INV-001',
          currency: 'EGP',
          total: '100.0000',
          ...data,
        })),
      },
    };
    const { svc, dispatch } = service();

    await svc.issue(tx as any, 't1', 'u1', 'm1', 'inv1');

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      tx,
      't1',
      expect.objectContaining({ eventType: 'INVOICE_ISSUED', caseId: 'c1' }),
    );

    (dispatch.dispatch as jest.Mock).mockRejectedValueOnce(
      new Error('queue down'),
    );
    await expect(
      svc.issue(tx as any, 't1', 'u1', 'm1', 'inv1'),
    ).resolves.toBeDefined();
  });

  it('refuses to issue non-draft and void paid invoices', async () => {
    const { svc } = service();
    const issuedTx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv1',
          status: 'ISSUED',
          total: '100.0000',
          currency: 'EGP',
          caseId: null,
        }),
      },
    };
    await expect(
      svc.issue(issuedTx as any, 't1', 'u1', 'm1', 'inv1'),
    ).rejects.toBeInstanceOf(BillingInvalidStateError);

    const voidTx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv1',
          status: 'ISSUED',
          total: '100.0000',
          currency: 'EGP',
          caseId: null,
          payments: [{ id: 'p1' }],
        }),
        update: jest.fn(),
      },
    };
    await expect(svc.void(voidTx as any, 't1', 'inv1')).rejects.toBeInstanceOf(
      BillingInvalidStateError,
    );
  });
});

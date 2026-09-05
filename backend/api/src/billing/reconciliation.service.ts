import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingNotFoundError } from './billing.errors';

export interface InvoiceOutstanding {
  total: Prisma.Decimal;
  paid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
}

@Injectable()
export class ReconciliationService {
  async outstanding(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<InvoiceOutstanding> {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true, total: true },
    });
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    const payments = await tx.payment.findMany({
      where: { invoiceId, tenantId, status: 'SUCCEEDED' },
      select: { amount: true },
    });
    const total = new Prisma.Decimal(invoice.total.toString());
    let paid = new Prisma.Decimal(0);
    for (const payment of payments) {
      paid = paid.plus(new Prisma.Decimal(payment.amount.toString()));
    }
    const applications = await tx.creditApplication.findMany({
      where: { invoiceId, tenantId },
      select: { amount: true },
    });
    for (const application of applications) {
      paid = paid.plus(new Prisma.Decimal(application.amount.toString()));
    }
    return { total, paid, outstanding: total.minus(paid) };
  }

  async refreshInvoiceStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<void> {
    const { total, outstanding } = await this.outstanding(
      tx,
      tenantId,
      invoiceId,
    );
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { status: true },
    });
    if (!invoice || invoice.status === 'VOID' || invoice.status === 'DRAFT') {
      return;
    }
    const next =
      outstanding.lte(0) && total.gt(0)
        ? 'PAID'
        : outstanding.lt(total)
          ? 'PARTIALLY_PAID'
          : 'ISSUED';
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: next },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaseTimelineService } from '../case-timeline/case-timeline.service';
import {
  BillingInvalidStateError,
  BillingNotFoundError,
} from './billing.errors';
import type { CreatePaymentDto } from './billing.dto';
import { LedgerService } from './ledger.service';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly reconciliation: ReconciliationService,
    private readonly timeline: CaseTimelineService,
  ) {}

  async record(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string | null,
    actorMembershipId: string | null,
    dto: CreatePaymentDto,
  ) {
    const replay = await tx.payment.findFirst({
      where: { tenantId, idempotencyKey: dto.idempotencyKey },
    });
    if (replay) return replay;

    const invoice = await tx.invoice.findFirst({
      where: { id: dto.invoiceId, tenantId },
    });
    if (!invoice) throw new BillingNotFoundError('Invoice not found');
    if (invoice.status !== 'ISSUED' && invoice.status !== 'PARTIALLY_PAID') {
      throw new BillingInvalidStateError('Invoice is not payable');
    }
    const { outstanding } = await this.reconciliation.outstanding(
      tx,
      tenantId,
      invoice.id,
    );
    const amount = new Prisma.Decimal(String(dto.amount));
    if (amount.lte(0)) {
      throw new BillingInvalidStateError('Payment amount must be positive');
    }
    if (amount.gt(outstanding)) {
      throw new BillingInvalidStateError('Payment exceeds outstanding balance');
    }

    const payment = await tx.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount,
        currency: dto.currency ?? invoice.currency,
        status: 'SUCCEEDED',
        providerRef: dto.providerRef,
        idempotencyKey: dto.idempotencyKey,
      },
    });
    await this.ledger.postBalanced(tx, tenantId, `payment:${payment.id}`, [
      {
        side: 'DEBIT',
        amount,
        currency: payment.currency,
        caseId: invoice.caseId ?? undefined,
        invoiceId: invoice.id,
        paymentId: payment.id,
        memo: 'cash',
      },
      {
        side: 'CREDIT',
        amount,
        currency: payment.currency,
        caseId: invoice.caseId ?? undefined,
        invoiceId: invoice.id,
        paymentId: payment.id,
        memo: 'receivable',
      },
    ]);
    await this.reconciliation.refreshInvoiceStatus(tx, tenantId, invoice.id);
    if (invoice.caseId) {
      await this.timeline.recordEvent(
        tx,
        tenantId,
        actorUserId,
        actorMembershipId,
        {
          caseId: invoice.caseId,
          eventType: 'PAYMENT_RECEIVED',
          payload: {
            amount: amount.toString(),
            providerRef: payment.providerRef ?? null,
          },
        },
      );
    }
    return payment;
  }

  async listByInvoice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ) {
    return tx.payment.findMany({
      where: { tenantId, invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma, type CurrencyCode } from '@prisma/client';
import { BillingInvalidStateError } from './billing.errors';

export interface LedgerLineInput {
  side: 'DEBIT' | 'CREDIT';
  amount: Prisma.Decimal | number | string;
  currency?: CurrencyCode;
  caseId?: string;
  invoiceId?: string;
  paymentId?: string;
  memo?: string;
}

@Injectable()
export class LedgerService {
  async postBalanced(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transactionId: string,
    lines: LedgerLineInput[],
  ): Promise<void> {
    if (lines.length === 0) {
      throw new BillingInvalidStateError('Ledger posting requires lines');
    }
    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);
    for (const line of lines) {
      const amount = new Prisma.Decimal(String(line.amount));
      if (amount.isNegative()) {
        throw new BillingInvalidStateError('Ledger amounts must be positive');
      }
      if (line.side === 'DEBIT') debits = debits.plus(amount);
      else credits = credits.plus(amount);
    }
    if (!debits.equals(credits)) {
      throw new BillingInvalidStateError('Unbalanced ledger posting');
    }
    await tx.ledgerEntry.createMany({
      data: lines.map((line) => ({
        tenantId,
        transactionId,
        side: line.side,
        amount: new Prisma.Decimal(String(line.amount)),
        currency: line.currency ?? 'EGP',
        caseId: line.caseId,
        invoiceId: line.invoiceId,
        paymentId: line.paymentId,
        memo: line.memo,
      })),
    });
  }
}

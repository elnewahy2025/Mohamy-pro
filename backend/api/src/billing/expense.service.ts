import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingNotFoundError } from './billing.errors';
import type { CreateExpenseDto } from './billing.dto';

@Injectable()
export class ExpenseService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateExpenseDto,
  ) {
    if (dto.caseId) {
      const found = await tx.case.findFirst({
        where: { id: dto.caseId, tenantId },
        select: { id: true },
      });
      if (!found) throw new BillingNotFoundError('Case not found');
    }
    return tx.expense.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        description: dto.description,
        amount: new Prisma.Decimal(String(dto.amount)),
        currency: dto.currency ?? 'EGP',
        receiptObjectId: dto.receiptObjectId,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string, caseId?: string) {
    return tx.expense.findMany({
      where: { tenantId, ...(caseId ? { caseId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

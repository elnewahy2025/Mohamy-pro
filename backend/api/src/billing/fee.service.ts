import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingNotFoundError } from './billing.errors';
import type { CreateFeeDto } from './billing.dto';

@Injectable()
export class FeeService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateFeeDto,
  ) {
    if (dto.caseId) {
      const found = await tx.case.findFirst({
        where: { id: dto.caseId, tenantId },
        select: { id: true },
      });
      if (!found) throw new BillingNotFoundError('Case not found');
    }
    if (dto.clientId) {
      const found = await tx.client.findFirst({
        where: { id: dto.clientId, tenantId },
        select: { id: true },
      });
      if (!found) throw new BillingNotFoundError('Client not found');
    }
    return tx.fee.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        clientId: dto.clientId,
        kind: dto.kind,
        description: dto.description,
        amount: new Prisma.Decimal(String(dto.amount)),
        currency: dto.currency ?? 'EGP',
        rateId: dto.rateId,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string, caseId?: string) {
    return tx.fee.findMany({
      where: { tenantId, ...(caseId ? { caseId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}

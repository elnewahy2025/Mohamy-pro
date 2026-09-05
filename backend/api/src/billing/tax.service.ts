import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateTaxRuleDto } from './billing.dto';

@Injectable()
export class TaxService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateTaxRuleDto,
  ) {
    return tx.taxRule.create({
      data: {
        tenantId,
        name: dto.name,
        rate: new Prisma.Decimal(String(dto.rate)),
        version: dto.version ?? 1,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.taxRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

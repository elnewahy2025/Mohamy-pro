import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';

@Injectable()
export class RateService {
  constructor(private readonly prisma: PrismaService) {}

  async createRate(tenantId: string, userId: string, data: any) {
    return this.prisma.rate.create({
      data: {
        ...data,
        tenantId,
        createdBy: userId,
      },
    });
  }

  async getRates(tenantId: string) {
    return this.prisma.rate.findMany({ where: { tenantId } });
  }

  async calculateApplicableRate(
    tenantId: string,
    userId: string,
    clientId?: string,
    caseId?: string,
  ) {
    // Basic resolution order: Case -> Client -> User -> Default
    let rate = null;

    if (caseId) {
      rate = await this.prisma.rate.findFirst({
        where: { tenantId, type: 'CASE', referenceId: caseId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!rate && clientId) {
      rate = await this.prisma.rate.findFirst({
        where: { tenantId, type: 'CLIENT', referenceId: clientId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!rate) {
      rate = await this.prisma.rate.findFirst({
        where: { tenantId, type: 'USER', referenceId: userId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!rate) {
      rate = await this.prisma.rate.findFirst({
        where: { tenantId, type: 'DEFAULT', referenceId: 'DEFAULT' },
        orderBy: { createdAt: 'desc' },
      });
    }

    return rate;
  }
}

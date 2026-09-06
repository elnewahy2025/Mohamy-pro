import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class PortalService {
  private async ownCaseIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ): Promise<string[]> {
    const rows = await tx.case.findMany({
      where: { tenantId, clientId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async myCases(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    return tx.case.findMany({
      where: { tenantId, clientId },
      select: {
        id: true,
        caseNumber: true,
        status: true,
        priority: true,
        openDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myDocuments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    return tx.document.findMany({
      where: { tenantId, clientId },
      select: {
        id: true,
        title: true,
        documentType: true,
        status: true,
        createdAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async myHearings(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    const caseIds = await this.ownCaseIds(tx, tenantId, clientId);
    return tx.hearing.findMany({
      where: { tenantId, caseId: { in: caseIds } },
      select: { id: true, caseId: true, date: true, status: true },
      orderBy: { date: 'asc' },
    });
  }

  async myDeadlines(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    const caseIds = await this.ownCaseIds(tx, tenantId, clientId);
    return tx.deadline.findMany({
      where: { tenantId, caseId: { in: caseIds } },
      select: {
        id: true,
        caseId: true,
        title: true,
        dueDate: true,
        status: true,
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async myMessages(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    return tx.message.findMany({
      where: { tenantId, clientId },
      select: {
        id: true,
        channel: true,
        direction: true,
        status: true,
        subject: true,
        body: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myInvoices(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    return tx.invoice.findMany({
      where: { tenantId, clientId },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        dueDate: true,
        payments: {
          select: { id: true, amount: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myCredits(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    return tx.credit.findMany({
      where: { tenantId, clientId },
      select: { id: true, amount: true, appliedAmount: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async agenda(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    const [hearings, deadlines] = await Promise.all([
      this.myHearings(tx, tenantId, clientId),
      this.myDeadlines(tx, tenantId, clientId),
    ]);
    return [
      ...hearings.map((h) => ({
        kind: 'HEARING' as const,
        id: h.id,
        title: `Hearing ${h.status}`,
        startsAt: h.date,
      })),
      ...deadlines.map((d) => ({
        kind: 'DEADLINE' as const,
        id: d.id,
        title: d.title,
        startsAt: d.dueDate,
      })),
    ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
}

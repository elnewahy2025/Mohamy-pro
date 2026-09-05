import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CommunicationsNotFoundError } from './communications.errors';
import type { CreateThreadDto } from './communications.dto';

@Injectable()
export class ThreadService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateThreadDto,
  ) {
    for (const [model, id] of [
      ['case', dto.caseId],
      ['client', dto.clientId],
      ['task', dto.taskId],
    ] as const) {
      if (!id) continue;
      const found = await (tx as any)[model].findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!found)
        throw new CommunicationsNotFoundError(`Linked ${model} not found`);
    }
    return tx.messageThread.create({
      data: {
        tenantId,
        subject: dto.subject,
        caseId: dto.caseId,
        clientId: dto.clientId,
        taskId: dto.taskId,
      },
    });
  }

  async list(
    tx: Prisma.TransactionClient,
    tenantId: string,
    filters: { caseId?: string; clientId?: string },
  ) {
    return tx.messageThread.findMany({
      where: {
        tenantId,
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async close(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const thread = await tx.messageThread.findFirst({
      where: { id, tenantId },
    });
    if (!thread) throw new CommunicationsNotFoundError('Thread not found');
    return tx.messageThread.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }
}

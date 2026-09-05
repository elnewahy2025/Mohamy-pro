import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CaseTimelineService } from '../case-timeline/case-timeline.service';
import {
  CommunicationsInvalidStateError,
  CommunicationsNotFoundError,
} from './communications.errors';
import type { CreateMessageDto } from './communications.dto';

@Injectable()
export class MessageService {
  constructor(private readonly timeline: CaseTimelineService) {}

  async compose(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string | null,
    actorMembershipId: string | null,
    dto: CreateMessageDto,
  ) {
    if (!dto.caseId && !dto.clientId && !dto.taskId) {
      throw new CommunicationsInvalidStateError(
        'Message must link a case, client, or task',
      );
    }
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
    if (dto.threadId) {
      const thread = await tx.messageThread.findFirst({
        where: { id: dto.threadId, tenantId },
        select: { id: true, status: true },
      });
      if (!thread) throw new CommunicationsNotFoundError('Thread not found');
      if (thread.status === 'CLOSED') {
        throw new CommunicationsInvalidStateError('Thread is closed');
      }
    }
    if (dto.direction === 'OUTBOUND' && dto.clientId) {
      const consent = await tx.messageConsent.findFirst({
        where: { tenantId, clientId: dto.clientId, channel: dto.channel },
      });
      if (consent?.status === 'OPT_OUT') {
        throw new CommunicationsInvalidStateError(
          'Client opted out of this channel',
        );
      }
    }
    const message = await tx.message.create({
      data: {
        tenantId,
        threadId: dto.threadId,
        channel: dto.channel,
        direction: dto.direction,
        status: dto.direction === 'OUTBOUND' ? 'QUEUED' : 'DELIVERED',
        subject: dto.subject,
        body: dto.body,
        caseId: dto.caseId,
        clientId: dto.clientId,
        taskId: dto.taskId,
        sentAt: dto.direction === 'OUTBOUND' ? null : new Date(),
      },
    });
    if (
      dto.caseId &&
      (dto.channel === 'INTERNAL' || dto.channel === 'PORTAL')
    ) {
      await this.timeline.recordEvent(
        tx,
        tenantId,
        actorUserId,
        actorMembershipId,
        {
          caseId: dto.caseId,
          eventType: 'NOTE_ADDED',
          payload: { channel: dto.channel, direction: dto.direction },
        },
      );
    }
    return message;
  }

  async list(
    tx: Prisma.TransactionClient,
    tenantId: string,
    filters: {
      threadId?: string;
      caseId?: string;
      clientId?: string;
      channel?: string;
    },
  ) {
    return tx.message.findMany({
      where: {
        tenantId,
        ...(filters.threadId ? { threadId: filters.threadId } : {}),
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.channel ? { channel: filters.channel as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

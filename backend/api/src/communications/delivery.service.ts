import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CommunicationsInvalidStateError,
  CommunicationsNotFoundError,
} from './communications.errors';
import type {
  AddAttachmentDto,
  RecordMessageStatusDto,
} from './communications.dto';

const TERMINAL: Record<string, string[]> = {
  QUEUED: ['SENT', 'FAILED'],
  SENT: ['DELIVERED', 'FAILED', 'READ'],
  DELIVERED: ['READ'],
  FAILED: [],
  READ: [],
};

@Injectable()
export class DeliveryService {
  async recordStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    dto: RecordMessageStatusDto,
  ) {
    const message = await tx.message.findFirst({ where: { id, tenantId } });
    if (!message) throw new CommunicationsNotFoundError('Message not found');
    const allowed = TERMINAL[message.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new CommunicationsInvalidStateError(
        `Cannot move message from ${message.status} to ${dto.status}`,
      );
    }
    return tx.message.update({
      where: { id },
      data: {
        status: dto.status,
        error: dto.error,
        sentAt:
          dto.status === 'SENT'
            ? (message.sentAt ?? new Date())
            : message.sentAt,
      },
    });
  }

  async addAttachment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    dto: AddAttachmentDto,
  ) {
    const message = await tx.message.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!message) throw new CommunicationsNotFoundError('Message not found');
    return tx.messageAttachment.create({
      data: {
        tenantId,
        messageId: id,
        storageObjectId: dto.storageObjectId,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
      },
    });
  }

  async listAttachments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const message = await tx.message.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!message) throw new CommunicationsNotFoundError('Message not found');
    return tx.messageAttachment.findMany({
      where: { tenantId, messageId: id },
      orderBy: { createdAt: 'asc' },
    });
  }
}

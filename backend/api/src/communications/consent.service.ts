import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CommunicationsNotFoundError } from './communications.errors';
import type { SetConsentDto } from './communications.dto';

@Injectable()
export class ConsentService {
  async set(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: SetConsentDto,
  ) {
    const client = await tx.client.findFirst({
      where: { id: dto.clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new CommunicationsNotFoundError('Client not found');
    return tx.messageConsent.upsert({
      where: {
        tenantId_clientId_channel: {
          tenantId,
          clientId: dto.clientId,
          channel: dto.channel,
        },
      },
      create: {
        tenantId,
        clientId: dto.clientId,
        channel: dto.channel,
        status: dto.status,
      },
      update: { status: dto.status, decidedAt: new Date() },
    });
  }

  async listByClient(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    return tx.messageConsent.findMany({
      where: { tenantId, clientId },
      orderBy: { channel: 'asc' },
    });
  }
}

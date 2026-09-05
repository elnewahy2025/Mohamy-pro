import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CalendarNotFoundError } from './calendar.errors';
import type { CreateConnectionDto } from './calendar.dto';

@Injectable()
export class ConnectionService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateConnectionDto,
  ) {
    return tx.calendarConnection.create({
      data: {
        tenantId,
        provider: dto.provider,
        accountRef: dto.accountRef,
        status: 'DISABLED',
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.calendarConnection.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setEnabled(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    enabled: boolean,
  ) {
    const connection = await tx.calendarConnection.findFirst({
      where: { id, tenantId },
    });
    if (!connection)
      throw new CalendarNotFoundError('Calendar connection not found');
    return tx.calendarConnection.update({
      where: { id },
      data: { status: enabled ? 'ACTIVE' : 'DISABLED' },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CalendarInvalidStateError,
  CalendarNotFoundError,
} from './calendar.errors';
import type {
  PullChangesDto,
  PushEventDto,
  ResolveConflictDto,
  WebhookReceiptDto,
} from './calendar.dto';

export interface AgendaItem {
  kind: 'HEARING' | 'DEADLINE' | 'TASK';
  id: string;
  title: string;
  startsAt: Date;
}

@Injectable()
export class SyncService {
  private async requireActiveConnection(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
  ) {
    const connection = await tx.calendarConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
    if (!connection)
      throw new CalendarNotFoundError('Calendar connection not found');
    if (connection.status !== 'ACTIVE') {
      throw new CalendarInvalidStateError('Calendar connection is disabled');
    }
    return connection;
  }

  private async requireLocal(
    tx: Prisma.TransactionClient,
    tenantId: string,
    localType: 'HEARING' | 'DEADLINE' | 'TASK',
    localId: string,
  ) {
    const model =
      localType === 'HEARING'
        ? tx.hearing
        : localType === 'DEADLINE'
          ? tx.deadline
          : tx.task;
    const found = await (model as any).findFirst({
      where: { id: localId, tenantId },
      select: { id: true },
    });
    if (!found)
      throw new CalendarNotFoundError(`Linked ${localType} not found`);
  }

  async push(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: PushEventDto,
  ) {
    const connection = await this.requireActiveConnection(
      tx,
      tenantId,
      dto.connectionId,
    );
    await this.requireLocal(tx, tenantId, dto.localType, dto.localId);
    return tx.calendarEventMapping.upsert({
      where: {
        tenantId_connectionId_localType_localId: {
          tenantId,
          connectionId: connection.id,
          localType: dto.localType,
          localId: dto.localId,
        },
      },
      create: {
        tenantId,
        connectionId: connection.id,
        localType: dto.localType,
        localId: dto.localId,
        direction: 'PUSH',
      },
      update: { direction: 'PUSH' },
    });
  }

  async pull(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: PullChangesDto,
  ) {
    const connection = await this.requireActiveConnection(
      tx,
      tenantId,
      dto.connectionId,
    );
    const cursor = await tx.calendarSyncCursor.upsert({
      where: {
        tenantId_connectionId_resource: {
          tenantId,
          connectionId: connection.id,
          resource: 'CALENDAR',
        },
      },
      create: {
        tenantId,
        connectionId: connection.id,
        resource: 'CALENDAR',
        lastSyncedAt: new Date(),
      },
      update: { lastSyncedAt: new Date(), attempts: 0, nextRetryAt: null },
    });
    return { cursor, providerPending: true };
  }

  async listMappings(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
  ) {
    return tx.calendarEventMapping.findMany({
      where: { tenantId, connectionId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async recordWebhook(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
    dto: WebhookReceiptDto,
  ) {
    const connection = await tx.calendarConnection.findFirst({
      where: { id: connectionId, tenantId },
      select: { id: true },
    });
    if (!connection)
      throw new CalendarNotFoundError('Calendar connection not found');
    return tx.calendarSyncConflict.create({
      data: {
        tenantId,
        connectionId: connection.id,
        localType: dto.localType ?? 'HEARING',
        localId: dto.localId ?? 'unknown',
        reason: `webhook: ${dto.reason}`,
        resolution: 'PENDING',
      },
    });
  }

  async listConflicts(
    tx: Prisma.TransactionClient,
    tenantId: string,
    connectionId: string,
  ) {
    return tx.calendarSyncConflict.findMany({
      where: { tenantId, connectionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveConflict(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    dto: ResolveConflictDto,
  ) {
    const conflict = await tx.calendarSyncConflict.findFirst({
      where: { id, tenantId },
    });
    if (!conflict) throw new CalendarNotFoundError('Sync conflict not found');
    if (conflict.resolution !== 'PENDING') {
      throw new CalendarInvalidStateError('Conflict already resolved');
    }
    return tx.calendarSyncConflict.update({
      where: { id },
      data: { resolution: dto.resolution, resolvedAt: new Date() },
    });
  }

  async agenda(
    tx: Prisma.TransactionClient,
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<AgendaItem[]> {
    const [hearings, deadlines, tasks] = await Promise.all([
      tx.hearing.findMany({
        where: { tenantId, date: { gte: from, lte: to } },
        select: { id: true, date: true, hearingType: true },
      }),
      tx.deadline.findMany({
        where: { tenantId, dueDate: { gte: from, lte: to } },
        select: { id: true, title: true, dueDate: true },
      }),
      tx.task.findMany({
        where: { tenantId, dueDate: { gte: from, lte: to } },
        select: { id: true, title: true, dueDate: true },
      }),
    ]);
    const items: AgendaItem[] = [
      ...hearings.map((h) => ({
        kind: 'HEARING' as const,
        id: h.id,
        title: h.hearingType ?? 'Hearing',
        startsAt: h.date,
      })),
      ...deadlines.map((d) => ({
        kind: 'DEADLINE' as const,
        id: d.id,
        title: d.title,
        startsAt: d.dueDate,
      })),
      ...tasks
        .filter((t) => t.dueDate)
        .map((t) => ({
          kind: 'TASK' as const,
          id: t.id,
          title: t.title,
          startsAt: t.dueDate as Date,
        })),
    ];
    return items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
}

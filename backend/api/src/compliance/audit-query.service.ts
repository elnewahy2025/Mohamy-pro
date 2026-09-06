import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCsv } from '../transfer/csv.parser';
import type { AuditQueryDto } from './compliance.dto';

const AUDIT_SELECT = {
  id: true,
  eventType: true,
  eventVersion: true,
  category: true,
  outcome: true,
  actorMembershipId: true,
  targetType: true,
  targetId: true,
  policy: true,
  reasonCode: true,
  correlationId: true,
  metadata: true,
  occurredAt: true,
} as const;

const EXPORT_COLUMNS = [
  'id',
  'eventType',
  'category',
  'outcome',
  'actorMembershipId',
  'targetType',
  'targetId',
  'occurredAt',
] as const;

@Injectable()
export class AuditQueryService {
  private where(tenantId: string, query: AuditQueryDto) {
    return {
      tenantId,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.outcome ? { outcome: query.outcome as never } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  async search(
    tx: Prisma.TransactionClient,
    tenantId: string,
    query: AuditQueryDto,
  ) {
    return tx.auditEvent.findMany({
      where: this.where(tenantId, query),
      orderBy: { occurredAt: 'desc' },
      take: 100,
      select: AUDIT_SELECT,
    });
  }

  async exportCsv(
    tx: Prisma.TransactionClient,
    tenantId: string,
    query: AuditQueryDto,
  ): Promise<string> {
    const rows = await tx.auditEvent.findMany({
      where: this.where(tenantId, query),
      orderBy: { occurredAt: 'desc' },
      take: 1000,
      select: AUDIT_SELECT,
    });
    const watermark = `# generated ${new Date().toISOString()} tenant=${tenantId} rows=${rows.length}`;
    return (
      watermark +
      '\r\n' +
      toCsv(
        EXPORT_COLUMNS,
        rows.map((row) =>
          EXPORT_COLUMNS.map((column) => this.cell(row[column])),
        ),
      )
    );
  }

  private cell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

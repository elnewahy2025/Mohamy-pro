import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ReportingInvalidStateError,
  ReportingNotFoundError,
} from './reporting.errors';
import { EXPORT_COLUMNS } from '../transfer/columns.allowlist';
import {
  ResourceAccessService,
  type CaseAccessScope,
} from '../permissions/resource-access.service';

export interface ReportScope {
  scope: CaseAccessScope;
  membershipId: string;
}

export interface ReportOutput {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  grouped?: Record<string, Record<string, unknown>[]>;
}

const MAX_ROWS = 1000;

type Definition = {
  id: string;
  dataSource: string;
  columns: unknown;
  filters: unknown;
  groupBy: string | null;
  sortBy: string | null;
  sortDir: string | null;
};

@Injectable()
export class RunService {
  constructor(private readonly resourceAccess: ResourceAccessService) {}

  async execute(
    tx: Prisma.TransactionClient,
    tenantId: string,
    definitionId: string,
    access?: ReportScope,
  ): Promise<ReportOutput> {
    const definition = await tx.reportDefinition.findFirst({
      where: { id: definitionId, tenantId },
    });
    if (!definition) throw new ReportingNotFoundError('Report not found');
    const columns = definition.columns as string[];
    const allowed = new Set(EXPORT_COLUMNS[definition.dataSource] ?? []);
    for (const column of columns) {
      if (!allowed.has(column)) {
        throw new ReportingInvalidStateError(
          `Column not exportable: ${column}`,
        );
      }
    }
    for (const field of [definition.groupBy, definition.sortBy]) {
      if (field && !allowed.has(field)) {
        throw new ReportingInvalidStateError(
          `Field is not an exportable column: ${field}`,
        );
      }
    }
    const filters = (definition.filters ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(filters)) {
      if (!allowed.has(key)) {
        throw new ReportingInvalidStateError(
          `Filter key is not an exportable column: ${key}`,
        );
      }
    }
    let caseIds: string[] | undefined;
    if (access?.scope === 'ASSIGNED') {
      caseIds = await this.resourceAccess.assignedCaseIds(
        tx,
        tenantId,
        access.membershipId,
      );
    }
    const rows = await this.fetchRows(tx, tenantId, definition, caseIds);
    if (rows.length > MAX_ROWS) {
      throw new ReportingInvalidStateError(
        `Report exceeds ${MAX_ROWS} rows; narrow the filters`,
      );
    }
    const projected = rows.map((row) => this.project(row, columns));
    const sorted = this.sortRows(projected, definition);
    if (!definition.groupBy) {
      return { columns, rows: sorted, total: sorted.length };
    }
    const grouped: Record<string, Record<string, unknown>[]> = {};
    for (const row of sorted) {
      const key = String(row[definition.groupBy] ?? 'unassigned');
      (grouped[key] ??= []).push(row);
    }
    return { columns, rows: sorted, total: sorted.length, grouped };
  }

  private project(
    row: Record<string, unknown>,
    columns: string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const column of columns) out[column] = this.cell(row[column]);
    return out;
  }

  private cell(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  private sortRows(
    rows: Record<string, unknown>[],
    definition: Definition,
  ): Record<string, unknown>[] {
    if (!definition.sortBy) return rows;
    const dir = definition.sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const left = a[definition.sortBy as string];
      const right = b[definition.sortBy as string];
      if (left === right) return 0;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      return (left < right ? -1 : 1) * dir;
    });
  }

  private filterClauses(definition: Definition): Record<string, unknown>[] {
    const filters = (definition.filters ?? {}) as Record<string, unknown>;
    return Object.entries(filters).map(([key, value]) => ({ [key]: value }));
  }

  private async fetchRows(
    tx: Prisma.TransactionClient,
    tenantId: string,
    definition: Definition,
    caseIds?: string[],
  ): Promise<Record<string, unknown>[]> {
    const take = MAX_ROWS + 1;
    const extra = this.filterClauses(definition);
    switch (definition.dataSource) {
      case 'CASE':
        return tx.case.findMany({
          where: {
            tenantId,
            ...(caseIds ? { id: { in: caseIds } } : {}),
            AND: extra,
          },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'CLIENT':
        return tx.client.findMany({
          where: { tenantId, AND: extra },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'PARTY':
        return tx.party.findMany({
          where: { tenantId, AND: extra },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'TASK':
        return tx.task.findMany({
          where: {
            tenantId,
            ...(caseIds ? { caseId: { in: caseIds } } : {}),
            AND: extra,
          },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'INVOICE':
        return tx.invoice.findMany({
          where: {
            tenantId,
            ...(caseIds ? { caseId: { in: caseIds } } : {}),
            AND: extra,
          },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'PAYMENT':
        return tx.payment.findMany({
          where: {
            tenantId,
            ...(caseIds ? { invoice: { caseId: { in: caseIds } } } : {}),
            AND: extra,
          },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'HEARING':
        return tx.hearing.findMany({
          where: {
            tenantId,
            ...(caseIds ? { caseId: { in: caseIds } } : {}),
            AND: extra,
          },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'DEADLINE':
        return tx.deadline.findMany({
          where: {
            tenantId,
            ...(caseIds ? { caseId: { in: caseIds } } : {}),
            AND: extra,
          },
          take,
        }) as Promise<Record<string, unknown>[]>;
      case 'DOCUMENT':
        return tx.document.findMany({
          where: {
            tenantId,
            ...(caseIds ? { caseId: { in: caseIds } } : {}),
            AND: extra,
          },
          take,
        }) as Promise<Record<string, unknown>[]>;
      default:
        throw new ReportingInvalidStateError('Unknown data source');
    }
  }
}

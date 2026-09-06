import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ReportingInvalidStateError,
  ReportingNotFoundError,
} from './reporting.errors';
import type { CreateDefinitionDto } from './reporting.dto';
import { EXPORT_COLUMNS } from '../transfer/columns.allowlist';

@Injectable()
export class DefinitionService {
  validateColumns(entityType: string, columns: string[]): void {
    const allowed = new Set(EXPORT_COLUMNS[entityType] ?? []);
    for (const column of columns) {
      if (!allowed.has(column)) {
        throw new ReportingInvalidStateError(
          `Column not exportable: ${column}`,
        );
      }
    }
  }

  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateDefinitionDto,
  ) {
    this.validateColumns(dto.dataSource, dto.columns);
    this.validateField(dto.dataSource, 'groupBy', dto.groupBy);
    this.validateField(dto.dataSource, 'sortBy', dto.sortBy);
    this.validateFilters(dto.dataSource, dto.filters);
    return tx.reportDefinition.create({
      data: {
        tenantId,
        name: dto.name,
        dataSource: dto.dataSource,
        columns: dto.columns,
        filters: dto.filters ?? {},
        groupBy: dto.groupBy,
        sortBy: dto.sortBy,
        sortDir: dto.sortDir ?? 'asc',
        createdBy: userId,
      },
    });
  }

  private validateField(
    entityType: string,
    field: string,
    value?: string,
  ): void {
    if (!value) return;
    const allowed = new Set(EXPORT_COLUMNS[entityType] ?? []);
    if (!allowed.has(value)) {
      throw new ReportingInvalidStateError(
        `${field} is not an exportable column: ${value}`,
      );
    }
  }

  private validateFilters(
    entityType: string,
    filters?: Record<string, string>,
  ): void {
    if (!filters) return;
    const allowed = new Set(EXPORT_COLUMNS[entityType] ?? []);
    for (const key of Object.keys(filters)) {
      if (!allowed.has(key)) {
        throw new ReportingInvalidStateError(
          `Filter key is not an exportable column: ${key}`,
        );
      }
    }
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.reportDefinition.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const definition = await tx.reportDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!definition) throw new ReportingNotFoundError('Report not found');
    return definition;
  }
}

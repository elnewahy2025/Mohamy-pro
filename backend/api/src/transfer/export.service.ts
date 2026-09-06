import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TransferInvalidStateError,
  TransferNotFoundError,
} from './transfer.errors';
import type { CreateExportDto } from './transfer.dto';
import { toCsv } from './csv.parser';
import { EXPORT_COLUMNS, MAX_EXPORT_ROWS } from './columns.allowlist';

@Injectable()
export class ExportService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateExportDto,
  ) {
    if (dto.format === 'XLSX') {
      throw new TransferInvalidStateError('XLSX export is not wired yet');
    }
    const replay = await tx.exportJob.findFirst({
      where: { tenantId, idempotencyKey: dto.idempotencyKey },
    });
    if (replay) return replay;
    const maxRows = dto.maxRows ?? MAX_EXPORT_ROWS;
    if (maxRows > MAX_EXPORT_ROWS) {
      throw new TransferInvalidStateError(
        `Export capped at ${MAX_EXPORT_ROWS} rows`,
      );
    }
    return tx.exportJob.create({
      data: {
        tenantId,
        entityType: dto.entityType,
        filters: dto.filters ?? {},
        format: dto.format ?? 'CSV',
        requestedBy: userId,
        idempotencyKey: dto.idempotencyKey,
        maxRows,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async generate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    jobId: string,
  ): Promise<string> {
    const job = await tx.exportJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) throw new TransferNotFoundError('Export job not found');
    if (job.status !== 'QUEUED') {
      throw new TransferInvalidStateError('Only queued exports can run');
    }
    const columns = EXPORT_COLUMNS[job.entityType] ?? [];
    if (columns.length === 0) {
      throw new TransferInvalidStateError('No exportable columns configured');
    }
    await tx.exportJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING' },
    });
    const rows = await this.fetchRows(
      tx,
      tenantId,
      job.entityType,
      job.maxRows,
    );
    const watermark = `# generated ${new Date().toISOString()} tenant=${tenantId} job=${job.id}`;
    const csv =
      watermark +
      '\r\n' +
      toCsv(
        columns,
        rows.map((row) =>
          columns.map((col) => this.cell(row[col as keyof typeof row])),
        ),
      );
    await tx.exportJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', rowCount: rows.length },
    });
    return csv;
  }

  private cell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private async fetchRows(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entityType: string,
    maxRows: number,
  ): Promise<Record<string, unknown>[]> {
    const take = Math.min(maxRows, MAX_EXPORT_ROWS);
    if (entityType === 'CASE') {
      return tx.case.findMany({ where: { tenantId }, take });
    }
    if (entityType === 'CLIENT') {
      return tx.client.findMany({ where: { tenantId }, take });
    }
    if (entityType === 'PARTY') {
      return tx.party.findMany({ where: { tenantId }, take });
    }
    return tx.task.findMany({ where: { tenantId }, take });
  }

  async download(
    tx: Prisma.TransactionClient,
    tenantId: string,
    jobId: string,
  ): Promise<{ csv: string; expiresAt: Date | null }> {
    const job = await tx.exportJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) throw new TransferNotFoundError('Export job not found');
    if (job.status !== 'COMPLETED') {
      throw new TransferInvalidStateError('Export is not ready');
    }
    if (job.expiresAt && job.expiresAt <= new Date()) {
      await tx.exportJob.update({
        where: { id: job.id },
        data: { status: 'EXPIRED' },
      });
      throw new TransferInvalidStateError('Export link expired');
    }
    const csv = await this.generateFresh(
      tx,
      tenantId,
      job.entityType,
      job.maxRows,
    );
    return { csv, expiresAt: job.expiresAt };
  }

  private async generateFresh(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entityType: string,
    maxRows: number,
  ): Promise<string> {
    const columns = EXPORT_COLUMNS[entityType] ?? [];
    const rows = await this.fetchRows(tx, tenantId, entityType, maxRows);
    const watermark = `# generated ${new Date().toISOString()} tenant=${tenantId}`;
    return (
      watermark +
      '\r\n' +
      toCsv(
        columns,
        rows.map((row) =>
          columns.map((col) =>
            this.cell((row as Record<string, unknown>)[col]),
          ),
        ),
      )
    );
  }
}

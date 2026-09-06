import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { RedisService } from '../infrastructure/redis/redis.service';
import {
  TransferInvalidStateError,
  TransferNotFoundError,
} from './transfer.errors';
import type { ApproveImportDto, CreateImportDto } from './transfer.dto';
import { parseCsv } from './csv.parser';
import {
  IMPORT_REQUIRED_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_INLINE_BYTES,
} from './columns.allowlist';

export const TRANSFER_IMPORT_QUEUE = 'transfer.import';

@Injectable()
export class ImportService {
  private queue?: Queue;

  constructor(private readonly redis: RedisService) {}

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(TRANSFER_IMPORT_QUEUE, {
        connection: this.redis.getClient(),
      });
    }
    return this.queue;
  }

  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateImportDto,
  ) {
    if (dto.format === 'XLSX') {
      throw new TransferInvalidStateError('XLSX import is not wired yet');
    }
    const replay = await tx.importJob.findFirst({
      where: { tenantId, idempotencyKey: dto.idempotencyKey },
    });
    if (replay) return replay;
    if (
      dto.content &&
      Buffer.byteLength(dto.content, 'utf8') > MAX_INLINE_BYTES
    ) {
      throw new TransferInvalidStateError('Inline content exceeds 256KB');
    }
    return tx.importJob.create({
      data: {
        tenantId,
        entityType: dto.entityType,
        format: dto.format ?? 'CSV',
        storageObjectId: dto.storageObjectId,
        content: dto.content,
        mapping: dto.mapping ?? {},
        requestedBy: userId,
        idempotencyKey: dto.idempotencyKey,
      },
    });
  }

  async validate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    jobId: string,
  ) {
    const job = await tx.importJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) throw new TransferNotFoundError('Import job not found');
    if (job.status !== 'DRAFT') {
      throw new TransferInvalidStateError('Only draft jobs can be validated');
    }
    if (!job.content) {
      throw new TransferInvalidStateError(
        'Storage-backed imports require object fetch wiring',
      );
    }
    let parsed: ReturnType<typeof parseCsv>;
    try {
      parsed = parseCsv(job.content);
    } catch {
      await tx.importJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' },
      });
      throw new TransferInvalidStateError('Malformed CSV content');
    }
    if (parsed.rows.length === 0) {
      throw new TransferInvalidStateError('CSV contains no data rows');
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      throw new TransferInvalidStateError(
        `CSV exceeds ${MAX_IMPORT_ROWS} rows`,
      );
    }
    const required = IMPORT_REQUIRED_COLUMNS[job.entityType] ?? [];
    const missing = required.filter((col) => !parsed.headers.includes(col));
    if (missing.length > 0) {
      throw new TransferInvalidStateError(
        `Missing required columns: ${missing.join(', ')}`,
      );
    }
    await tx.importRowError.deleteMany({ where: { jobId: job.id, tenantId } });
    let valid = 0;
    const errors: { rowNumber: number; raw: unknown; errors: string[] }[] = [];
    for (let index = 0; index < parsed.rows.length; index++) {
      const row = parsed.rows[index];
      const rowErrors = await this.validateRow(
        tx,
        tenantId,
        job.entityType,
        row,
      );
      if (rowErrors.length === 0) valid += 1;
      else errors.push({ rowNumber: index + 2, raw: row, errors: rowErrors });
    }
    for (const entry of errors) {
      await tx.importRowError.create({
        data: {
          tenantId,
          jobId: job.id,
          rowNumber: entry.rowNumber,
          raw: entry.raw as Prisma.InputJsonValue,
          errors: entry.errors,
        },
      });
    }
    return tx.importJob.update({
      where: { id: job.id },
      data: {
        status: 'VALIDATED',
        totalRows: parsed.rows.length,
        validRows: valid,
        errorRows: errors.length,
      },
    });
  }

  private async validateRow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entityType: string,
    row: Record<string, string>,
  ): Promise<string[]> {
    const problems: string[] = [];
    const required = IMPORT_REQUIRED_COLUMNS[entityType] ?? [];
    for (const col of required) {
      if (!row[col]) problems.push(`Missing required value: ${col}`);
    }
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase().endsWith('id') && value && !this.isUuid(value)) {
        problems.push(`Invalid UUID: ${key}`);
      }
    }
    if (entityType === 'CASE' && row.caseNumber) {
      const dupe = await tx.case.findFirst({
        where: { tenantId, caseNumber: row.caseNumber },
        select: { id: true },
      });
      if (dupe) problems.push(`Duplicate caseNumber: ${row.caseNumber}`);
    }
    if (entityType === 'CASE' && row.clientId) {
      const client = await tx.client.findFirst({
        where: { id: row.clientId, tenantId },
        select: { id: true },
      });
      if (!client) problems.push(`Unknown clientId: ${row.clientId}`);
    }
    if (entityType === 'CLIENT' && row.displayName) {
      const dupe = await tx.client.findFirst({
        where: { tenantId, displayName: row.displayName },
        select: { id: true },
      });
      if (dupe) problems.push(`Duplicate displayName: ${row.displayName}`);
    }
    if (entityType === 'PARTY' && row.displayName) {
      const dupe = await tx.party.findFirst({
        where: { tenantId, displayName: row.displayName },
        select: { id: true },
      });
      if (dupe) problems.push(`Duplicate displayName: ${row.displayName}`);
    }
    return problems;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  async approve(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    jobId: string,
    dto: ApproveImportDto,
  ) {
    const job = await tx.importJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) throw new TransferNotFoundError('Import job not found');
    if (job.status !== 'VALIDATED') {
      throw new TransferInvalidStateError(
        'Only validated jobs can be approved',
      );
    }
    if (job.requestedBy === userId) {
      throw new TransferInvalidStateError(
        'Approver must differ from requester',
      );
    }
    if (dto.idempotencyKey) {
      const replay = await tx.importJob.findFirst({
        where: { tenantId, idempotencyKey: dto.idempotencyKey },
      });
      if (replay && replay.id !== job.id) return replay;
    }
    return tx.importJob.update({
      where: { id: job.id },
      data: { status: 'APPROVED', approvedBy: userId },
    });
  }

  async enqueueRun(tenantId: string, jobId: string): Promise<void> {
    await this.getQueue().add(
      'import.run',
      { tenantId, jobId },
      { jobId: `import-${jobId}`, removeOnComplete: 100 },
    );
  }

  async runJob(prisma: PrismaServiceLike, tenantId: string, jobId: string) {
    const job = await prisma.importJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) throw new TransferNotFoundError('Import job not found');
    if (job.status !== 'APPROVED') {
      throw new TransferInvalidStateError('Only approved jobs can run');
    }
    if (!job.content) {
      throw new TransferInvalidStateError(
        'Storage-backed imports are not wired',
      );
    }
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING' },
    });
    try {
      const parsed = parseCsv(job.content);
      const createdIds: { entity: string; id: string }[] = [];
      for (const row of parsed.rows) {
        const created = await this.createRow(
          prisma,
          tenantId,
          job.entityType,
          row,
        );
        if (created) createdIds.push({ entity: job.entityType, id: created });
      }
      return prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          resultSummary: { created: createdIds.length, createdIds },
        },
      });
    } catch (error) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  private async createRow(
    prisma: PrismaServiceLike,
    tenantId: string,
    entityType: string,
    row: Record<string, string>,
  ): Promise<string | null> {
    if (entityType === 'CASE') {
      const created = await prisma.case.create({
        data: {
          tenantId,
          caseNumber: row.caseNumber,
          clientId: row.clientId,
          internalNumber: row.internalNumber || undefined,
          practiceArea: row.practiceArea || undefined,
          caseType: row.caseType || undefined,
        },
      });
      return created.id;
    }
    if (entityType === 'CLIENT') {
      const created = await prisma.client.create({
        data: {
          tenantId,
          name: row.legalName || row.displayName,
          displayName: row.displayName,
          legalName: row.legalName || undefined,
          clientType:
            row.clientType === 'ORGANIZATION' ? 'ORGANIZATION' : 'INDIVIDUAL',
        },
      });
      return created.id;
    }
    if (entityType === 'PARTY') {
      const created = await prisma.party.create({
        data: {
          tenantId,
          displayName: row.displayName,
          partyType:
            row.partyType === 'ORGANIZATION' ? 'ORGANIZATION' : 'PERSON',
        },
      });
      return created.id;
    }
    if (entityType === 'TASK') {
      const created = await prisma.task.create({
        data: {
          tenantId,
          title: row.title,
          description: row.description || undefined,
          caseId: row.caseId || undefined,
        },
      });
      return created.id;
    }
    return null;
  }

  async rollback(
    tx: Prisma.TransactionClient,
    tenantId: string,
    jobId: string,
  ) {
    const job = await tx.importJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) throw new TransferNotFoundError('Import job not found');
    if (job.status !== 'COMPLETED') {
      throw new TransferInvalidStateError('Only completed jobs can roll back');
    }
    const summary = (job.resultSummary ?? {}) as {
      createdIds?: { entity: string; id: string }[];
    };
    for (const entry of summary.createdIds ?? []) {
      if (entry.entity === 'CASE') {
        await tx.case.deleteMany({ where: { id: entry.id, tenantId } });
      } else if (entry.entity === 'CLIENT') {
        await tx.client.deleteMany({ where: { id: entry.id, tenantId } });
      } else if (entry.entity === 'PARTY') {
        await tx.party.deleteMany({ where: { id: entry.id, tenantId } });
      } else if (entry.entity === 'TASK') {
        await tx.task.deleteMany({ where: { id: entry.id, tenantId } });
      }
    }
    return tx.importJob.update({
      where: { id: job.id },
      data: { status: 'ROLLED_BACK' },
    });
  }
}

export interface PrismaServiceLike {
  importJob: {
    findFirst(args: unknown): Promise<any>;
    update(args: unknown): Promise<any>;
  };
  case: { create(args: unknown): Promise<{ id: string }> };
  client: { create(args: unknown): Promise<{ id: string }> };
  party: { create(args: unknown): Promise<{ id: string }> };
  task: { create(args: unknown): Promise<{ id: string }> };
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import {
  TRANSFER_EXPORT_PERMISSION,
  TRANSFER_IMPORT_PERMISSION,
  TransferOperations,
} from './transfer.operations';
import {
  ApproveImportDto,
  CreateExportDto,
  CreateImportDto,
} from './transfer.dto';
import { ImportService } from './import.service';
import { ExportService } from './export.service';

@Controller({
  path: 'transfer',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class TransferController {
  constructor(
    private readonly operations: TransferOperations,
    private readonly imports: ImportService,
    private readonly exports: ExportService,
  ) {}

  @Post('imports')
  async createImport(@Req() request: Request, @Body() dto: CreateImportDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.IMPORT_VALIDATED,
      'ImportJob',
      (tx) => this.imports.create(tx, ctx.tenantId, ctx.userId, dto),
      { entityType: dto.entityType },
    );
  }

  @Get('imports')
  async listImports(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      tx.importJob.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  @Post('imports/:id/validate')
  async validateImport(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.IMPORT_VALIDATED,
      'ImportJob',
      (tx) => this.imports.validate(tx, ctx.tenantId, id),
      {},
    );
  }

  @Post('imports/:id/approve')
  async approveImport(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveImportDto,
  ) {
    const ctx = await this.operations.authorize(request);
    const approved = await this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.IMPORT_APPROVED,
      'ImportJob',
      (tx) => this.imports.approve(tx, ctx.tenantId, ctx.userId, id, dto),
      {},
    );
    await this.imports.enqueueRun(ctx.tenantId, approved.id);
    return approved;
  }

  @Post('imports/:id/rollback')
  async rollbackImport(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.IMPORT_ROLLED_BACK,
      'ImportJob',
      (tx) => this.imports.rollback(tx, ctx.tenantId, id),
      {},
    );
  }

  @Get('imports/:id/errors')
  async listImportErrors(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      tx.importRowError.findMany({
        where: { tenantId: ctx.tenantId, jobId: id },
        orderBy: { rowNumber: 'asc' },
      }),
    );
  }

  @Post('exports')
  async createExport(@Req() request: Request, @Body() dto: CreateExportDto) {
    const ctx = await this.operations.authorize(
      request,
      TRANSFER_EXPORT_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.EXPORT_COMPLETED,
      'ExportJob',
      (tx) => this.exports.create(tx, ctx.tenantId, ctx.userId, dto),
      { entityType: dto.entityType },
      TRANSFER_EXPORT_PERMISSION,
    );
  }

  @Get('exports')
  async listExports(@Req() request: Request) {
    const ctx = await this.operations.authorize(
      request,
      TRANSFER_EXPORT_PERMISSION,
    );
    return this.operations.read(request, ctx, (tx) =>
      tx.exportJob.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  @Post('exports/:id/run')
  async runExport(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(
      request,
      TRANSFER_EXPORT_PERMISSION,
    );
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.EXPORT_COMPLETED,
      'ExportJob',
      (tx) => this.exports.generate(tx, ctx.tenantId, id),
      {},
      TRANSFER_EXPORT_PERMISSION,
    );
  }

  @Get('exports/:id/download')
  async downloadExport(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(
      request,
      TRANSFER_EXPORT_PERMISSION,
    );
    return this.operations.read(request, ctx, (tx) =>
      this.exports.download(tx, ctx.tenantId, id),
    );
  }

  @Get('imports/:id')
  async getImport(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      tx.importJob.findFirst({ where: { id, tenantId: ctx.tenantId } }),
    );
  }
}

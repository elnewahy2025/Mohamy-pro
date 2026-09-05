import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { DocumentOperations } from './document.operations';
import { DocumentService } from './document.service';
import {
  CreateDocumentDto,
  UploadNewVersionDto,
  UpdateDocumentStatusDto,
  ShareDocumentDto,
} from './document.dto';

@Controller({
  path: 'documents',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class DocumentController {
  constructor(
    private readonly operations: DocumentOperations,
    private readonly documentService: DocumentService,
  ) {}

  @Get()
  async listDocuments(
    @Req() request: Request,
    @Query('caseId') caseId?: string,
    @Query('clientId') clientId?: string,
  ) {
    const ctx = await this.operations.authorizeCaseAccess(request);
    return this.operations.read(request, ctx, async (tx) => {
      return this.documentService.listDocuments(
        tx,
        ctx.tenantId,
        caseId,
        clientId,
        {
          scope: ctx.scope,
          membershipId: ctx.actorMembershipId,
        },
      );
    });
  }

  @Post()
  async uploadDocument(
    @Req() request: Request,
    @Body() dto: CreateDocumentDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DOCUMENT_UPLOADED,
      'Document',
      async (tx) => {
        return this.documentService.createDocument(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          dto,
        );
      },
      {
        caseId: dto.caseId,
        clientId: dto.clientId,
        documentType: dto.documentType,
        versionNumber: 1,
        storageObjectId: dto.storageObjectId,
      },
    );
  }

  @Post(':id/versions')
  async uploadNewVersion(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadNewVersionDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DOCUMENT_VERSIONED,
      'Document',
      async (tx) => {
        return this.documentService.uploadNewVersion(
          tx,
          ctx.tenantId,
          id,
          ctx.actorMembershipId,
          dto,
        );
      },
      {
        storageObjectId: dto.storageObjectId,
      },
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentStatusDto,
  ) {
    const ctx = await this.operations.authorize(request);
    const eventType =
      dto.status === 'ARCHIVED'
        ? AUDIT_EVENT_TYPES.DOCUMENT_ARCHIVED
        : AUDIT_EVENT_TYPES.DOCUMENT_STATUS_CHANGED;

    return this.operations.run(
      request,
      ctx,
      eventType,
      'Document',
      async (tx) => {
        return this.documentService.updateStatus(tx, ctx.tenantId, id, dto);
      },
      dto.status === 'ARCHIVED'
        ? { documentId: id }
        : { documentId: id, status: dto.status },
    );
  }

  @Post(':id/share')
  async shareDocument(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShareDocumentDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DOCUMENT_SHARED,
      'DocumentShare',
      async (tx) => {
        return this.documentService.shareDocument(
          tx,
          ctx.tenantId,
          id,
          ctx.actorMembershipId,
          dto,
        );
      },
      { sharedWithEmail: dto.sharedWithEmail },
    );
  }
}

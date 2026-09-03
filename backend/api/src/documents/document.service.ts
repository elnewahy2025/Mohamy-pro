import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DocumentNotFoundError,
  DocumentInvalidStateError,
} from './document.errors';
import type {
  CreateDocumentDto,
  UploadNewVersionDto,
  UpdateDocumentStatusDto,
  ShareDocumentDto,
} from './document.dto';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  async createDocument(
    tx: Prisma.TransactionClient,
    tenantId: string,
    uploaderUserId: string,
    dto: CreateDocumentDto,
  ) {
    return tx.document.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        clientId: dto.clientId,
        title: dto.title,
        description: dto.description,
        documentType: dto.documentType,
        uploadedById: uploaderUserId,
        versions: {
          create: {
            versionNumber: 1,
            storageObjectId: dto.storageObjectId,
            mimeType: dto.mimeType,
            fileSize: dto.fileSize,
            checksum: dto.checksum,
            createdById: uploaderUserId,
          },
        },
      },
      include: {
        versions: true,
      },
    });
  }

  async listDocuments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId?: string,
    clientId?: string,
  ) {
    return tx.document.findMany({
      where: {
        tenantId,
        ...(caseId ? { caseId } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: {
        uploadedBy: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        tags: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async uploadNewVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
    uploaderUserId: string,
    dto: UploadNewVersionDto,
  ) {
    const doc = await tx.document.findUnique({
      where: { id: documentId, tenantId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!doc) throw new DocumentNotFoundError('Document not found');
    if (doc.status === 'ARCHIVED') {
      throw new DocumentInvalidStateError(
        'Cannot version an archived document',
      );
    }

    const nextVersion = (doc.versions[0]?.versionNumber ?? 0) + 1;

    return tx.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: nextVersion,
        storageObjectId: dto.storageObjectId,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        checksum: dto.checksum,
        createdById: uploaderUserId,
      },
    });
  }

  async updateStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
    dto: UpdateDocumentStatusDto,
  ) {
    const doc = await tx.document.findUnique({
      where: { id: documentId, tenantId },
    });

    if (!doc) throw new DocumentNotFoundError('Document not found');

    return tx.document.update({
      where: { id: documentId },
      data: {
        status: dto.status,
      },
    });
  }

  async shareDocument(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentId: string,
    sharerUserId: string,
    dto: ShareDocumentDto,
  ) {
    const doc = await tx.document.findUnique({
      where: { id: documentId, tenantId },
    });

    if (!doc) throw new DocumentNotFoundError('Document not found');
    if (doc.status === 'ARCHIVED') {
      throw new DocumentInvalidStateError('Cannot share an archived document');
    }

    return tx.documentShare.create({
      data: {
        documentId,
        sharedWithEmail: dto.sharedWithEmail,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: sharerUserId,
      },
    });
  }
}

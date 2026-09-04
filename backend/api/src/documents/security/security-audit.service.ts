import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DocumentDownloadResult } from '@prisma/client';

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logDownloadAttempt(params: {
    tenantId: string;
    documentId: string;
    documentVersionId: string;
    storageObjectId: string;
    userId?: string;
    membershipId?: string;
    sessionId?: string;
    accessGrantId?: string;
    result: DocumentDownloadResult;
    ip?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<void> {
    this.logger.log(
      `Logging download attempt for document version ${params.documentVersionId}, result: ${params.result}`,
    );

    await this.prisma.documentDownload.create({
      data: {
        tenantId: params.tenantId,
        documentId: params.documentId,
        documentVersionId: params.documentVersionId,
        storageObjectId: params.storageObjectId,
        userId: params.userId,
        membershipId: params.membershipId,
        sessionId: params.sessionId,
        accessGrantId: params.accessGrantId,
        result: params.result,
        ip: params.ip,
        userAgent: params.userAgent,
        correlationId: params.correlationId,
        completedAt: new Date(),
      },
    });
  }
}

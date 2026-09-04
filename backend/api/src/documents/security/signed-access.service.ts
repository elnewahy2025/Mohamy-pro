import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DocumentAccessPurpose, DocumentSecurityStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class SignedAccessService {
  private readonly logger = new Logger(SignedAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateAccessGrant(
    tenantId: string,
    documentVersionId: string,
    userId: string,
    purpose: DocumentAccessPurpose,
    ttlSeconds: number = 3600,
  ) {
    this.logger.log(
      `Generating signed access grant for document version ${documentVersionId}`,
    );

    // Verify security status first
    const metadata = await this.prisma.documentSecurityMetadata.findUnique({
      where: { documentVersionId },
    });

    if (
      !metadata ||
      metadata.securityStatus !== DocumentSecurityStatus.APPROVED
    ) {
      throw new ForbiddenException('Document is not cleared for access.');
    }

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + ttlSeconds);

    const grant = await this.prisma.signedAccessGrant.create({
      data: {
        tenantId,
        documentId: metadata.documentId,
        documentVersionId,
        storageObjectId: metadata.storageObjectId,
        issuedToUserId: userId,
        purpose,
        expiresAt,
        accessTokenId: randomUUID(),
      },
    });

    return grant;
  }

  async validateAccessGrant(tenantId: string, accessTokenId: string) {
    const grant = await this.prisma.signedAccessGrant.findUnique({
      where: { accessTokenId },
    });

    if (!grant || grant.tenantId !== tenantId) {
      throw new ForbiddenException('Invalid access grant');
    }

    if (grant.revokedAt) {
      throw new ForbiddenException('Access grant has been revoked');
    }

    if (grant.expiresAt < new Date()) {
      throw new ForbiddenException('Access grant has expired');
    }

    return grant;
  }

  async revokeAccessGrant(
    tenantId: string,
    accessTokenId: string,
  ): Promise<void> {
    const grant = await this.prisma.signedAccessGrant.findUnique({
      where: { accessTokenId },
    });

    if (!grant || grant.tenantId !== tenantId) {
      throw new ForbiddenException('Invalid access grant');
    }

    await this.prisma.signedAccessGrant.update({
      where: { accessTokenId },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Revoked access grant ${accessTokenId}`);
  }
}

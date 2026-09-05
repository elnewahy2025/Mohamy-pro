import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../../auth/session/session.guard';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SignedAccessService } from './signed-access.service';
import { DocumentSecurityService } from './document-security.service';
import { DocumentAccessPurpose } from '@prisma/client';

function requireAuthContext(request: Request): {
  tenantId: string;
  userId: string;
} {
  const auth = request.auth;
  if (!auth) throw new UnauthorizedException('UNAUTHENTICATED');
  if (!auth.activeTenantId)
    throw new BadRequestException('TENANT_CONTEXT_REQUIRED');
  return { tenantId: auth.activeTenantId, userId: auth.userId };
}

@Controller({
  path: 'documents/:id/security',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class DocumentSecurityController {
  constructor(
    private readonly signedAccessService: SignedAccessService,
    private readonly securityService: DocumentSecurityService,
  ) {}

  @Post('access')
  async requestAccess(
    @Param('id') documentId: string,
    @Body('documentVersionId') documentVersionId: string,
    @Body('purpose') purpose: DocumentAccessPurpose,
    @Req() req: Request,
  ) {
    const { tenantId, userId } = requireAuthContext(req);

    const grant = await this.signedAccessService.generateAccessGrant(
      tenantId,
      documentVersionId,
      userId,
      purpose,
    );

    return {
      success: true,
      data: {
        accessTokenId: grant.accessTokenId,
        expiresAt: grant.expiresAt,
        // The actual signed URL could be constructed here or on the client
        signedUrl: `/api/v1/documents/${documentId}/security/download/${grant.accessTokenId}`,
      },
    };
  }

  @Post('access/:grantId/revoke')
  async revokeAccess(
    @Param('id') documentId: string,
    @Param('grantId') grantId: string,
    @Req() req: Request,
  ) {
    void documentId;
    const { tenantId } = requireAuthContext(req);

    await this.signedAccessService.revokeAccessGrant(tenantId, grantId);

    return { success: true };
  }
}

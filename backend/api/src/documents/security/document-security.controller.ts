import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SignedAccessService } from './signed-access.service';
import { DocumentSecurityService } from './document-security.service';
import { DocumentAccessPurpose } from '@prisma/client';

// Assuming global guards (SessionGuard, CsrfGuard) are configured or applied per route
@Controller('v1/documents/:id/security')
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
    @Req() req: any,
  ) {
    const tenantId = req.tenantId; // Expected from Session/Tenant middlewares
    const userId = req.user?.id; // Expected from auth middlewares

    // Authorization: User must have CanReadDocument or CanDownloadDocument permissions.
    // This would be enforced by a @RequirePermission guard in a real implementation.

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
        signedUrl: `/v1/documents/${documentId}/security/download/${grant.accessTokenId}`,
      },
    };
  }

  @Post('access/:grantId/revoke')
  async revokeAccess(
    @Param('id') documentId: string,
    @Param('grantId') grantId: string,
    @Req() req: any,
  ) {
    const tenantId = req.tenantId;

    await this.signedAccessService.revokeAccessGrant(tenantId, grantId);

    return { success: true };
  }
}

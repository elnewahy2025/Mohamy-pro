import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  Get,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../../auth/session/session.guard';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { OcrProcessingService } from './ocr-processing.service';
import { HumanReviewService } from './human-review.service';

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
  path: 'documents/:id/ocr',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class OcrController {
  constructor(
    private readonly ocrService: OcrProcessingService,
    private readonly reviewService: HumanReviewService,
  ) {}

  @Post()
  async initiateOcr(
    @Param('id') documentId: string,
    @Body('documentVersionId') documentVersionId: string,
    @Req() req: Request,
  ) {
    const { tenantId } = requireAuthContext(req);

    const processingId = await this.ocrService.enqueueProcessing(
      tenantId,
      documentId,
      documentVersionId,
    );

    return { success: true, processingId };
  }

  @Post(':processingId/review')
  async reviewOcr(
    @Param('id') documentId: string,
    @Param('processingId') processingId: string,
    @Body('action') action: 'APPROVE' | 'REJECT',
    @Body('notes') notes: string,
    @Req() req: Request,
  ) {
    void documentId;
    const { tenantId, userId } = requireAuthContext(req);

    await this.reviewService.submitReview(
      tenantId,
      processingId,
      userId,
      action,
      notes,
    );

    return { success: true };
  }
}

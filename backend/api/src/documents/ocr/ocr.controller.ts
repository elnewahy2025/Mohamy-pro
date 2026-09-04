import { Controller, Post, Param, Body, Req, Get } from '@nestjs/common';
import { OcrProcessingService } from './ocr-processing.service';
import { HumanReviewService } from './human-review.service';

@Controller('v1/documents/:id/ocr')
export class OcrController {
  constructor(
    private readonly ocrService: OcrProcessingService,
    private readonly reviewService: HumanReviewService,
  ) {}

  @Post()
  async initiateOcr(
    @Param('id') documentId: string,
    @Body('documentVersionId') documentVersionId: string,
    @Req() req: any,
  ) {
    const tenantId = req.tenantId; // from middleware/guard

    // Check authorization/permissions here

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
    @Req() req: any,
  ) {
    const tenantId = req.tenantId;
    const reviewerId = req.user?.id;

    // Check authorization here

    await this.reviewService.submitReview(
      tenantId,
      processingId,
      reviewerId,
      action,
      notes,
    );

    return { success: true };
  }
}

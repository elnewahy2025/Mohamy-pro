import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { HumanReviewStatus, OcrProcessingStatus } from '@prisma/client';

@Injectable()
export class HumanReviewService {
  private readonly logger = new Logger(HumanReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitReview(
    tenantId: string,
    processingId: string,
    reviewerId: string,
    action: 'APPROVE' | 'REJECT',
    notes?: string,
    correctedEntities?: any[],
  ): Promise<void> {
    this.logger.log(
      `Submitting human review for processing ${processingId} by ${reviewerId}`,
    );

    const processing = await this.prisma.ocrProcessing.findUnique({
      where: { id: processingId },
    });

    if (!processing || processing.tenantId !== tenantId) {
      throw new NotFoundException('OCR Processing record not found');
    }

    if (processing.status !== OcrProcessingStatus.SUCCEEDED) {
      throw new BadRequestException(
        'Cannot review a processing job that has not succeeded',
      );
    }

    const reviewStatus =
      action === 'APPROVE'
        ? HumanReviewStatus.APPROVED
        : HumanReviewStatus.REJECTED;

    await this.prisma.$transaction(async (tx) => {
      // 1. Record the review
      await tx.humanReview.create({
        data: {
          tenantId,
          ocrProcessingId: processingId,
          reviewerId,
          status: reviewStatus,
          decision: action,
          notes,
          reviewedAt: new Date(),
        },
      });

      // 2. If approved, transfer to Authoritative metadata
      if (action === 'APPROVE') {
        const entities =
          correctedEntities ||
          (await tx.ocrEntity.findMany({
            where: { ocrProcessingId: processingId },
          }));

        await tx.approvedDocumentMetadata.create({
          data: {
            tenantId,
            documentId: processing.documentId,
            documentVersionId: processing.documentVersionId,
            ocrProcessingId: processingId,
            reviewerId,
            entities: entities,
          },
        });
      }
    });
  }
}

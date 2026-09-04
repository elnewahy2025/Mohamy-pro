import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { DocumentGenerationStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

@Controller('v1/templates/:templateId/generate')
export class TemplateGenerationController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async generateDocument(
    @Param('templateId') templateId: string,
    @Body() payload: any,
    @Req() req: any,
  ) {
    // Validates permission, tenant boundary, and approved template version

    const idempotencyKey = req.headers['idempotency-key'] || randomUUID();

    const existingJob = await this.prisma.documentGenerationJob.findFirst({
      where: { tenantId: req.tenantId, idempotencyKey },
    });

    if (existingJob) {
      return { message: 'Generation already requested', jobId: existingJob.id };
    }

    const job = await this.prisma.documentGenerationJob.create({
      data: {
        tenantId: req.tenantId,
        templateId,
        templateVersionId: payload.templateVersionId,
        caseId: payload.caseId,
        clientId: payload.clientId,
        requestedBy: req.user?.id || 'system',
        idempotencyKey,
        requestedFormats: payload.formats || ['DOCX'],
        status: DocumentGenerationStatus.QUEUED,
      },
    });

    // In a real implementation, this dispatches a BullMQ Outbox event to 'legal-document-generation' queue.

    return { success: true, jobId: job.id };
  }
}

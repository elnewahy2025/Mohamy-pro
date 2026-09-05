import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { DocumentGenerationStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

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
  path: 'templates/:templateId/generate',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class TemplateGenerationController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async generateDocument(
    @Param('templateId') templateId: string,
    @Body() payload: any,
    @Req() req: Request,
  ) {
    const { tenantId, userId } = requireAuthContext(req);
    const idempotencyHeader = req.headers['idempotency-key'];
    const idempotencyKey =
      (Array.isArray(idempotencyHeader)
        ? idempotencyHeader[0]
        : idempotencyHeader) || randomUUID();

    const existingJob = await this.prisma.documentGenerationJob.findFirst({
      where: { tenantId, idempotencyKey },
    });

    if (existingJob) {
      return { message: 'Generation already requested', jobId: existingJob.id };
    }

    const job = await this.prisma.documentGenerationJob.create({
      data: {
        tenantId,
        templateId,
        templateVersionId: payload.templateVersionId,
        caseId: payload.caseId,
        clientId: payload.clientId,
        requestedBy: userId,
        idempotencyKey,
        requestedFormats: payload.formats || ['DOCX'],
        status: DocumentGenerationStatus.QUEUED,
      },
    });

    // In a real implementation, this dispatches a BullMQ Outbox event to 'legal-document-generation' queue.

    return { success: true, jobId: job.id };
  }
}

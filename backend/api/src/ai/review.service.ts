import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiRequestService } from './request.service';
import { AiInvalidStateError } from './ai.errors';

@Injectable()
export class AiReviewService {
  constructor(private readonly requests: AiRequestService) {}

  async approve(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    id: string,
    reviewNotes?: string,
  ) {
    const request = await this.requests.get(tx, tenantId, id);
    if (request.status !== 'READY') {
      throw new AiInvalidStateError(
        'Only requests with provider output can be approved',
      );
    }
    if (!request.outputText) {
      throw new AiInvalidStateError(
        'Cannot approve a request with empty output',
      );
    }
    return tx.aiRequest.update({
      where: { id_tenantId: { id: request.id, tenantId } },
      data: {
        status: 'APPROVED',
        reviewedBy: membershipId,
        reviewNotes: reviewNotes ?? request.reviewNotes,
      },
    });
  }

  async reject(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    id: string,
    reason: string,
  ) {
    const request = await this.requests.get(tx, tenantId, id);
    if (request.status !== 'QUEUED' && request.status !== 'READY') {
      throw new AiInvalidStateError(
        'Only queued or ready requests can be rejected',
      );
    }
    return tx.aiRequest.update({
      where: { id_tenantId: { id: request.id, tenantId } },
      data: {
        status: 'REJECTED',
        reviewedBy: membershipId,
        reviewNotes: reason,
      },
    });
  }
}

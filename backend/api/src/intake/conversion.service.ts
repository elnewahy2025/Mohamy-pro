import { Injectable } from '@nestjs/common';
import { IntakeStatus, Prisma } from '@prisma/client';
import { IntakeInvalidStateError } from './intake.errors';
import { IntakeService } from './intake.service';

const REVIEWABLE: IntakeStatus[] = [IntakeStatus.NEW, IntakeStatus.IN_REVIEW];

@Injectable()
export class ConversionService {
  constructor(private readonly intake: IntakeService) {}

  async approve(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    id: string,
    reviewNotes?: string,
  ) {
    const request = await this.intake.get(tx, tenantId, id);
    if (!REVIEWABLE.includes(request.status)) {
      throw new IntakeInvalidStateError(
        'Only new or in-review requests can be approved',
      );
    }
    const claimed = await tx.intakeRequest.updateMany({
      where: {
        id: request.id,
        tenantId,
        status: { in: REVIEWABLE },
        createdClientId: null,
      },
      data: { status: 'APPROVED', reviewerMembershipId: membershipId },
    });
    if (claimed.count !== 1) {
      throw new IntakeInvalidStateError(
        'Intake request was already settled by another reviewer',
      );
    }
    const client = await tx.client.create({
      data: {
        tenantId,
        clientType: request.clientType,
        name: request.fullName,
        displayName: request.fullName,
        source: 'INTAKE',
        notes: request.matterSummary.slice(0, 2000),
      },
      select: { id: true },
    });
    return tx.intakeRequest.update({
      where: { id_tenantId: { id: request.id, tenantId } },
      data: {
        reviewerMembershipId: membershipId,
        reviewNotes: reviewNotes ?? request.reviewNotes,
        createdClientId: client.id,
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
    const request = await this.intake.get(tx, tenantId, id);
    if (!REVIEWABLE.includes(request.status)) {
      throw new IntakeInvalidStateError(
        'Only new or in-review requests can be rejected',
      );
    }
    return tx.intakeRequest.update({
      where: { id_tenantId: { id: request.id, tenantId } },
      data: {
        status: 'REJECTED',
        reviewerMembershipId: membershipId,
        rejectionReason: reason,
      },
    });
  }
}

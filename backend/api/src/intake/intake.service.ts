import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IntakeInvalidStateError, IntakeNotFoundError } from './intake.errors';
import type { CreateIntakeDto } from './intake.dto';

@Injectable()
export class IntakeService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateIntakeDto,
  ) {
    if (dto.conflictCheckId) {
      const check = await tx.conflictCheck.findFirst({
        where: { id: dto.conflictCheckId, tenantId },
        select: { id: true },
      });
      if (!check) {
        throw new IntakeInvalidStateError(
          'Linked conflict check not found in tenant',
        );
      }
    }
    return tx.intakeRequest.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        clientType: dto.clientType,
        matterSummary: dto.matterSummary,
        source: dto.source,
        conflictCheckId: dto.conflictCheckId,
        createdBy: userId,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.intakeRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const request = await tx.intakeRequest.findFirst({
      where: { id, tenantId },
    });
    if (!request) throw new IntakeNotFoundError('Intake request not found');
    return request;
  }

  async markInReview(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    id: string,
    reviewNotes?: string,
  ) {
    const request = await this.get(tx, tenantId, id);
    if (request.status !== 'NEW') {
      throw new IntakeInvalidStateError(
        'Only new intake requests can move to review',
      );
    }
    return tx.intakeRequest.update({
      where: { id_tenantId: { id: request.id, tenantId } },
      data: {
        status: 'IN_REVIEW',
        reviewerMembershipId: membershipId,
        reviewNotes: reviewNotes ?? request.reviewNotes,
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BreakGlassInvalidStateError,
  BreakGlassNotFoundError,
} from './breakglass.errors';
import type { ActivateBreakGlassDto } from './breakglass.dto';

export const BREAKGLASS_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BreakGlassService {
  async activate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    creatorMembershipId: string,
    dto: ActivateBreakGlassDto,
  ) {
    const subject = await tx.membership.findFirst({
      where: { id: dto.subjectMembershipId, tenantId },
      select: { id: true, status: true },
    });
    if (!subject || subject.status !== 'ACTIVE') {
      throw new BreakGlassNotFoundError('Subject membership not found');
    }
    const target = await tx.case.findFirst({
      where: { id: dto.caseId, tenantId },
      select: { id: true },
    });
    if (!target) throw new BreakGlassNotFoundError('Case not found');
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : new Date(Date.now() + BREAKGLASS_MAX_WINDOW_MS);
    if (!(endsAt.getTime() > Date.now())) {
      throw new BreakGlassInvalidStateError(
        'Break-glass window must be in the future',
      );
    }
    if (endsAt.getTime() - Date.now() > BREAKGLASS_MAX_WINDOW_MS) {
      throw new BreakGlassInvalidStateError(
        'Break-glass window exceeds 24 hours',
      );
    }
    const overlapping = await tx.breakGlassActivation.findFirst({
      where: {
        tenantId,
        subjectMembershipId: dto.subjectMembershipId,
        caseId: dto.caseId,
        revokedAt: null,
        endsAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new BreakGlassInvalidStateError(
        'Active break-glass grant already exists',
      );
    }
    return tx.breakGlassActivation.create({
      data: {
        tenantId,
        subjectMembershipId: dto.subjectMembershipId,
        caseId: dto.caseId,
        reason: dto.reason,
        endsAt,
        createdByMembershipId: creatorMembershipId,
      },
    });
  }

  async revoke(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const grant = await tx.breakGlassActivation.findFirst({
      where: { id, tenantId },
    });
    if (!grant)
      throw new BreakGlassNotFoundError('Break-glass grant not found');
    if (grant.revokedAt) {
      throw new BreakGlassInvalidStateError(
        'Break-glass grant already revoked',
      );
    }
    return tx.breakGlassActivation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async listActive(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId?: string,
  ) {
    return tx.breakGlassActivation.findMany({
      where: {
        tenantId,
        ...(caseId ? { caseId } : {}),
        revokedAt: null,
        endsAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

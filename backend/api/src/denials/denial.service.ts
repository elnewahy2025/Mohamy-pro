import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSION_CATALOG } from '../permissions/permission.constants';
import { DenialInvalidStateError, DenialNotFoundError } from './denial.errors';
import type { CreateDenialDto } from './denial.dto';

@Injectable()
export class DenialService {
  async createDenial(
    tx: Prisma.TransactionClient,
    tenantId: string,
    creatorMembershipId: string,
    dto: CreateDenialDto,
  ) {
    const known = PERMISSION_CATALOG.some(
      (item) => item.key === dto.permissionKey,
    );
    if (!known) {
      throw new DenialInvalidStateError('Unknown permission key');
    }
    if (dto.subjectUserId) {
      const subject = await tx.membership.findFirst({
        where: { userId: dto.subjectUserId, tenantId },
        select: { id: true, status: true },
      });
      if (!subject || subject.status !== 'ACTIVE') {
        throw new DenialNotFoundError('Subject membership not found');
      }
    }
    if (
      dto.endsAt &&
      dto.startsAt &&
      new Date(dto.endsAt) <= new Date(dto.startsAt)
    ) {
      throw new DenialInvalidStateError('Denial window is empty');
    }
    return tx.accessDenial.create({
      data: {
        tenantId,
        subjectUserId: dto.subjectUserId,
        permissionKey: dto.permissionKey,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        reason: dto.reason,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        createdByMembershipId: creatorMembershipId,
      },
    });
  }

  async revokeDenial(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const denial = await tx.accessDenial.findFirst({
      where: { id, tenantId },
    });
    if (!denial) throw new DenialNotFoundError('Denial not found');
    if (denial.status === 'REVOKED') {
      throw new DenialInvalidStateError('Denial already revoked');
    }
    return tx.accessDenial.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  async listDenials(
    tx: Prisma.TransactionClient,
    tenantId: string,
    filters: { subjectUserId?: string; permissionKey?: string },
  ) {
    return tx.accessDenial.findMany({
      where: {
        tenantId,
        ...(filters.subjectUserId
          ? { subjectUserId: filters.subjectUserId }
          : {}),
        ...(filters.permissionKey
          ? { permissionKey: filters.permissionKey }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

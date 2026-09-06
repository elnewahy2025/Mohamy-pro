import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ComplianceInvalidStateError,
  ComplianceNotFoundError,
} from './compliance.errors';
import { HOLD_TARGETS, type CreateHoldDto } from './compliance.dto';

@Injectable()
export class HoldService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateHoldDto,
  ) {
    if (dto.targetType && !HOLD_TARGETS.includes(dto.targetType as never)) {
      throw new ComplianceInvalidStateError('Unsupported hold target type');
    }
    if (dto.targetId && !dto.targetType) {
      throw new ComplianceInvalidStateError(
        'targetId requires a targetType scope',
      );
    }
    return tx.legalHold.create({
      data: {
        tenantId,
        name: dto.name,
        reason: dto.reason,
        targetType: dto.targetType,
        targetId: dto.targetId,
        createdBy: userId,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.legalHold.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async release(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    id: string,
    reason: string,
  ) {
    const hold = await tx.legalHold.findFirst({
      where: { id, tenantId },
    });
    if (!hold) throw new ComplianceNotFoundError('Legal hold not found');
    if (hold.status !== 'ACTIVE') {
      throw new ComplianceInvalidStateError(
        'Only active holds can be released',
      );
    }
    return tx.legalHold.update({
      where: { id_tenantId: { id: hold.id, tenantId } },
      data: {
        status: 'RELEASED',
        releasedBy: membershipId,
        releaseReason: reason,
        releasedAt: new Date(),
      },
    });
  }

  async active(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.legalHold.findMany({
      where: { tenantId, status: 'ACTIVE' },
      take: 100,
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ComplianceInvalidStateError } from './compliance.errors';
import {
  RETENTION_TARGETS,
  type CreateRetentionPolicyDto,
} from './compliance.dto';
import { HoldService } from './hold.service';

export interface RetentionEvaluation {
  targetType: string;
  retainYears: number;
  enabled: boolean;
  eligible: number;
  held: number;
}

@Injectable()
export class RetentionService {
  constructor(private readonly holds: HoldService) {}

  async setPolicy(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateRetentionPolicyDto,
  ) {
    if (!RETENTION_TARGETS.includes(dto.targetType as never)) {
      throw new ComplianceInvalidStateError(
        'Unsupported retention target type',
      );
    }
    return tx.retentionPolicy.upsert({
      where: {
        tenantId_targetType: { tenantId, targetType: dto.targetType },
      },
      create: {
        tenantId,
        targetType: dto.targetType,
        retainYears: dto.retainYears,
        enabled: dto.enabled ?? true,
        createdBy: userId,
      },
      update: {
        retainYears: dto.retainYears,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.retentionPolicy.findMany({
      where: { tenantId },
      orderBy: { targetType: 'asc' },
      take: 100,
    });
  }

  async evaluate(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<RetentionEvaluation[]> {
    const [policies, holds] = await Promise.all([
      this.list(tx, tenantId),
      this.holds.active(tx, tenantId),
    ]);
    const now = new Date();
    const results: RetentionEvaluation[] = [];
    for (const policy of policies) {
      if (policy.targetType !== 'AUDIT_EVENT' || !policy.enabled) {
        results.push({
          targetType: policy.targetType,
          retainYears: policy.retainYears,
          enabled: policy.enabled,
          eligible: 0,
          held: 0,
        });
        continue;
      }
      const expired = await tx.auditEvent.findMany({
        where: { tenantId, retentionUntil: { lt: now } },
        select: { id: true },
        take: 1000,
      });
      let held = 0;
      for (const event of expired) {
        if (this.isHeld(event.id, holds)) held += 1;
      }
      results.push({
        targetType: policy.targetType,
        retainYears: policy.retainYears,
        enabled: policy.enabled,
        eligible: expired.length - held,
        held,
      });
    }
    return results;
  }

  private isHeld(
    eventId: string,
    holds: Array<{ targetType: string | null; targetId: string | null }>,
  ): boolean {
    return holds.some(
      (hold) =>
        hold.targetType === null ||
        (hold.targetType === 'AUDIT_EVENT' &&
          (hold.targetId === null || hold.targetId === eventId)),
    );
  }
}

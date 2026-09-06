import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationInvalidStateError } from './notification.errors';
import type { CreateRuleDto, UpdateRuleDto } from './notification.dto';

const WIRED_CHANNELS = new Set(['IN_APP']);

@Injectable()
export class RuleService {
  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateRuleDto,
  ) {
    for (const channel of dto.channels) {
      if (!WIRED_CHANNELS.has(channel)) {
        throw new NotificationInvalidStateError(
          `Channel not wired yet: ${channel}`,
        );
      }
    }
    if (dto.escalateToMembershipId) {
      const target = await tx.membership.findFirst({
        where: { id: dto.escalateToMembershipId, tenantId },
        select: { id: true, status: true },
      });
      if (!target || target.status !== 'ACTIVE') {
        throw new NotificationInvalidStateError('Escalation target not found');
      }
    }
    return tx.notificationRule.create({
      data: {
        tenantId,
        eventType: dto.eventType,
        channels: dto.channels,
        audience: dto.audience ?? 'ASSIGNEES',
        enabled: dto.enabled ?? true,
        escalationHours: dto.escalationHours,
        escalateToMembershipId: dto.escalateToMembershipId,
      },
    });
  }

  async update(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    dto: UpdateRuleDto,
  ) {
    const rule = await tx.notificationRule.findFirst({
      where: { id, tenantId },
    });
    if (!rule) throw new NotificationInvalidStateError('Rule not found');
    return tx.notificationRule.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.escalationHours !== undefined
          ? { escalationHours: dto.escalationHours }
          : {}),
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.notificationRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

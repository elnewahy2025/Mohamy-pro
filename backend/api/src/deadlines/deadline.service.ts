import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DeadlineAccessDeniedError,
  DeadlineNotFoundError,
  DeadlineInvalidStateError,
} from './deadline.errors';
import type {
  CreateDeadlineRuleDto,
  CreateDeadlineDto,
  CompleteDeadlineDto,
} from './deadline.dto';
import {
  ResourceAccessService,
  type CaseAccessScope,
} from '../permissions/resource-access.service';

export interface CaseScope {
  scope: CaseAccessScope;
  membershipId: string;
}

@Injectable()
export class DeadlineService {
  private readonly logger = new Logger(DeadlineService.name);

  constructor(private readonly resourceAccess: ResourceAccessService) {}

  async createRule(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateDeadlineRuleDto,
  ) {
    return tx.deadlineRule.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        reminderRule: dto.reminderRule ?? Prisma.DbNull,
        escalationRule: dto.escalationRule ?? Prisma.DbNull,
      },
    });
  }

  async listRules(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.deadlineRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDeadline(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateDeadlineDto,
  ) {
    await this.requireVisible(tx, dto.caseId, () =>
      tx.case.findFirst({
        where: { id: dto.caseId, tenantId },
        select: { id: true },
      }),
    );
    await this.requireVisible(tx, dto.ruleId, () =>
      tx.deadlineRule.findFirst({
        where: { id: dto.ruleId, tenantId },
        select: { id: true },
      }),
    );
    await this.requireVisible(tx, dto.assignedUserId, () =>
      tx.membership.findFirst({
        where: { id: dto.assignedUserId, tenantId },
        select: { id: true },
      }),
    );

    return tx.deadline.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        title: dto.title,
        description: dto.description,
        deadlineType: dto.deadlineType,
        dueDate: new Date(dto.dueDate),
        ruleId: dto.ruleId,
        assignedUserId: dto.assignedUserId,
      },
    });
  }

  private async requireVisible(
    tx: Prisma.TransactionClient,
    id: string | undefined | null,
    query: () => Promise<{ id: string } | null>,
  ): Promise<void> {
    if (!id) return;
    const found = await query();
    if (!found)
      throw new DeadlineAccessDeniedError('RELATED_ENTITY_NOT_IN_TENANT');
  }

  async listDeadlines(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId?: string,
    access?: CaseScope,
  ) {
    if (access?.scope === 'ASSIGNED') {
      if (caseId) {
        await this.resourceAccess.requireAssignedCase(
          tx,
          tenantId,
          access.membershipId,
          caseId,
        );
      } else {
        const ids = await this.resourceAccess.assignedCaseIds(
          tx,
          tenantId,
          access.membershipId,
        );
        return tx.deadline.findMany({
          where: { tenantId, caseId: { in: ids } },
          include: {
            rule: true,
            assignedUser: true,
          },
          orderBy: {
            dueDate: 'asc',
          },
        });
      }
    }
    return tx.deadline.findMany({
      where: {
        tenantId,
        ...(caseId ? { caseId } : {}),
      },
      include: {
        rule: true,
        assignedUser: true,
      },
      orderBy: {
        dueDate: 'asc',
      },
    });
  }

  async completeDeadline(
    tx: Prisma.TransactionClient,
    tenantId: string,
    deadlineId: string,
    dto: CompleteDeadlineDto,
  ) {
    const deadline = await tx.deadline.findUnique({
      where: { id: deadlineId, tenantId },
    });

    if (!deadline) throw new DeadlineNotFoundError('Deadline not found');
    if (deadline.status === 'COMPLETED' || deadline.status === 'CANCELLED') {
      throw new DeadlineInvalidStateError(
        'Deadline is already completed or cancelled',
      );
    }

    return tx.deadline.update({
      where: { id: deadlineId },
      data: {
        status: 'COMPLETED',
        completionEvidence: dto.completionEvidence,
      },
    });
  }
}

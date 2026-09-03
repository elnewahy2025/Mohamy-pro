import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DeadlineNotFoundError,
  DeadlineInvalidStateError,
} from './deadline.errors';
import type {
  CreateDeadlineRuleDto,
  CreateDeadlineDto,
  CompleteDeadlineDto,
} from './deadline.dto';

@Injectable()
export class DeadlineService {
  private readonly logger = new Logger(DeadlineService.name);

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

  async listDeadlines(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId?: string,
  ) {
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

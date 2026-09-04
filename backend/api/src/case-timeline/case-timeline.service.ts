import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type CaseTimelineEventType } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { CaseTimelineAccessDeniedError } from './case-timeline.errors';
import type { CaseTimelineQueryDto } from './case-timeline.dto';
import type { Paginated } from '../common/api/envelope';
import type { CaseTimelineEvent } from '@prisma/client';

export interface CreateTimelineEventInput {
  caseId: string;
  eventType: CaseTimelineEventType;
  payload?: Record<string, any>;
}

@Injectable()
export class CaseTimelineService {
  private readonly logger = new Logger(CaseTimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string | null,
    actorMembershipId: string | null,
    input: CreateTimelineEventInput,
  ): Promise<CaseTimelineEvent> {
    const caseInTenant = await tx.case.findFirst({
      where: { id: input.caseId, tenantId },
      select: { id: true },
    });
    if (!caseInTenant) {
      throw new CaseTimelineAccessDeniedError('NO_CASE_IN_TENANT');
    }

    return await tx.caseTimelineEvent.create({
      data: {
        tenantId,
        caseId: input.caseId,
        eventType: input.eventType,
        payload: input.payload ?? Prisma.DbNull,
        actorUserId,
        actorMembershipId,
      },
    });
  }

  async listTimeline(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    query: CaseTimelineQueryDto,
  ): Promise<Paginated<CaseTimelineEvent>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      tx.caseTimelineEvent.count({
        where: {
          tenantId,
          caseId,
        },
      }),
      tx.caseTimelineEvent.findMany({
        where: {
          tenantId,
          caseId,
        },
        orderBy: {
          occurredAt: 'desc', // Chronological, newest first
        },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }
}

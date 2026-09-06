import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HearingAccessDeniedError,
  HearingNotFoundError,
  HearingInvalidStateError,
} from './hearing.errors';
import type { CreateHearingDto, UpdateHearingOutcomeDto } from './hearing.dto';
import {
  ResourceAccessService,
  type CaseAccessScope,
} from '../permissions/resource-access.service';
import { DispatchService } from '../notifications/dispatch.service';

export interface CaseScope {
  scope: CaseAccessScope;
  membershipId: string;
}

@Injectable()
export class HearingService {
  private readonly logger = new Logger(HearingService.name);

  constructor(
    private readonly resourceAccess: ResourceAccessService,
    private readonly dispatch: DispatchService,
  ) {}

  async createHearing(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateHearingDto,
  ) {
    await this.requireVisible(tx, dto.caseId, () =>
      tx.case.findFirst({
        where: { id: dto.caseId, tenantId },
        select: { id: true },
      }),
    );
    await this.requireVisible(tx, dto.courtId, () =>
      tx.court.findFirst({
        where: { id: dto.courtId, OR: [{ tenantId: null }, { tenantId }] },
        select: { id: true },
      }),
    );
    await this.requireVisible(tx, dto.courtLocationId, () =>
      tx.courtLocation.findFirst({
        where: {
          id: dto.courtLocationId,
          OR: [{ tenantId: null }, { tenantId }],
        },
        select: { id: true },
      }),
    );
    await this.requireVisible(tx, dto.assignedLawyerId, () =>
      tx.membership.findFirst({
        where: { id: dto.assignedLawyerId, tenantId },
        select: { id: true },
      }),
    );
    await this.requireVisible(tx, dto.nextHearingId, () =>
      tx.hearing.findFirst({
        where: { id: dto.nextHearingId, tenantId },
        select: { id: true },
      }),
    );

    const hearing = await tx.hearing.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        courtId: dto.courtId,
        courtLocationId: dto.courtLocationId,
        assignedLawyerId: dto.assignedLawyerId,
        date: new Date(dto.date),
        time: dto.time,
        hearingType: dto.hearingType,
        notes: dto.notes,
        nextHearingId: dto.nextHearingId,
      },
    });
    try {
      await this.dispatch.dispatch(tx, tenantId, {
        eventType: 'HEARING_SCHEDULED',
        caseId: dto.caseId,
        title: `Hearing scheduled for ${dto.date}`,
        body: dto.hearingType ?? 'Hearing',
      });
    } catch (error) {
      this.logger.warn({
        message: 'Hearing notification dispatch failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return hearing;
  }

  private async requireVisible(
    tx: Prisma.TransactionClient,
    id: string | undefined | null,
    query: () => Promise<{ id: string } | null>,
  ): Promise<void> {
    if (!id) return;
    const found = await query();
    if (!found)
      throw new HearingAccessDeniedError('RELATED_ENTITY_NOT_IN_TENANT');
  }

  async listHearings(
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
        return tx.hearing.findMany({
          where: { tenantId, caseId: { in: ids } },
          include: {
            court: true,
            courtLocation: true,
            assignedLawyer: true,
          },
          orderBy: { date: 'asc' },
        });
      }
    }
    return tx.hearing.findMany({
      where: {
        tenantId,
        ...(caseId ? { caseId } : {}),
      },
      include: {
        court: true,
        courtLocation: true,
        assignedLawyer: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  async recordOutcome(
    tx: Prisma.TransactionClient,
    tenantId: string,
    hearingId: string,
    dto: UpdateHearingOutcomeDto,
  ) {
    const hearing = await tx.hearing.findUnique({
      where: { id: hearingId, tenantId },
    });

    if (!hearing) throw new HearingNotFoundError('Hearing not found');
    if (hearing.status !== 'SCHEDULED' && hearing.status !== 'POSTPONED') {
      throw new HearingInvalidStateError(
        'Can only record outcome for SCHEDULED or POSTPONED hearings',
      );
    }

    return tx.hearing.update({
      where: { id: hearingId },
      data: {
        outcome: dto.outcome,
        status: dto.status,
      },
    });
  }

  async deleteHearing(
    tx: Prisma.TransactionClient,
    tenantId: string,
    hearingId: string,
  ) {
    const hearing = await tx.hearing.findUnique({
      where: { id: hearingId, tenantId },
    });
    if (!hearing) throw new HearingNotFoundError('Hearing not found');

    return tx.hearing.delete({
      where: { id: hearingId },
    });
  }
}

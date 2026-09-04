import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HearingAccessDeniedError,
  HearingNotFoundError,
  HearingInvalidStateError,
} from './hearing.errors';
import type { CreateHearingDto, UpdateHearingOutcomeDto } from './hearing.dto';

@Injectable()
export class HearingService {
  private readonly logger = new Logger(HearingService.name);

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

    return tx.hearing.create({
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
  ) {
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

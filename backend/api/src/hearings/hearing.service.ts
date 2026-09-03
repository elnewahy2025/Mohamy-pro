import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
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

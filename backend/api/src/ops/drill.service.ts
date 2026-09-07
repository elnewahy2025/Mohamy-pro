import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpsInvalidStateError, OpsNotFoundError } from './ops.errors';
import type { FinishDrillDto, StartDrillDto } from './ops.dto';

@Injectable()
export class DrillService {
  async start(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: StartDrillDto,
  ) {
    return tx.restoreDrill.create({
      data: {
        tenantId,
        name: dto.name,
        targetRef: dto.targetRef,
        startedBy: userId,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.restoreDrill.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async latest(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.restoreDrill.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async finish(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    id: string,
    dto: FinishDrillDto,
  ) {
    const drill = await tx.restoreDrill.findFirst({
      where: { id, tenantId },
    });
    if (!drill) throw new OpsNotFoundError('Restore drill not found');
    if (drill.status !== 'PLANNED') {
      throw new OpsInvalidStateError('Only planned drills can be finished');
    }
    for (const check of dto.checks) {
      if (!check.passed && dto.passed) {
        throw new OpsInvalidStateError(
          'Cannot mark a drill passed with failing checks',
        );
      }
    }
    return tx.restoreDrill.update({
      where: { id_tenantId: { id: drill.id, tenantId } },
      data: {
        status: dto.passed ? 'PASSED' : 'FAILED',
        checks: dto.checks as unknown as Prisma.InputJsonValue,
        note: dto.note,
        finishedBy: membershipId,
        finishedAt: new Date(),
      },
    });
  }
}

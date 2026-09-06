import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ReportingNotFoundError } from './reporting.errors';
import type { CreateScheduleDto } from './reporting.dto';
import { RunService } from './run.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: RunService,
  ) {}

  computeNextRun(frequency: string, runAt: string, from: Date): Date {
    const [hour, minute] = runAt.split(':').map(Number);
    const next = new Date(from);
    next.setUTCHours(hour, minute, 0, 0);
    if (next <= from) {
      next.setUTCDate(next.getUTCDate() + (frequency === 'WEEKLY' ? 7 : 1));
    }
    return next;
  }

  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: CreateScheduleDto,
  ) {
    const definition = await tx.reportDefinition.findFirst({
      where: { id: dto.definitionId, tenantId },
      select: { id: true },
    });
    if (!definition) throw new ReportingNotFoundError('Report not found');
    return tx.reportSchedule.create({
      data: {
        tenantId,
        definitionId: dto.definitionId,
        frequency: dto.frequency,
        runAt: dto.runAt,
        enabled: dto.enabled ?? true,
        createdBy: userId,
        nextRunAt: this.computeNextRun(dto.frequency, dto.runAt, new Date()),
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.reportSchedule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweepDueSchedules(): Promise<void> {
    const now = new Date();
    try {
      const due = await this.prisma.reportSchedule.findMany({
        where: { enabled: true, nextRunAt: { lte: now } },
        take: 100,
      });
      for (const schedule of due) {
        try {
          await this.prisma.withWorkerTenantContext(
            schedule.tenantId,
            randomUUID(),
            async (tx) => {
              const claimed = await tx.reportSchedule.updateMany({
                where: {
                  id: schedule.id,
                  tenantId: schedule.tenantId,
                  enabled: true,
                  nextRunAt: { lte: now },
                },
                data: { nextRunAt: new Date(now.getTime() + 3_600_000) },
              });
              if (claimed.count === 0) return;
              const output = await this.runs.execute(
                tx,
                schedule.tenantId,
                schedule.definitionId,
              );
              await tx.reportRun.create({
                data: {
                  tenantId: schedule.tenantId,
                  definitionId: schedule.definitionId,
                  scheduleId: schedule.id,
                  status: 'COMPLETED',
                  rowCount: output.total,
                  triggeredBy: 'scheduler',
                },
              });
              await tx.reportSchedule.update({
                where: { id: schedule.id },
                data: {
                  lastRunAt: now,
                  nextRunAt: this.computeNextRun(
                    schedule.frequency,
                    schedule.runAt,
                    now,
                  ),
                },
              });
            },
          );
        } catch (error) {
          this.logger.error({
            message: 'Scheduled report run failed',
            scheduleId: schedule.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      this.logger.error({
        message: 'Report schedule sweep failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

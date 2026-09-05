import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { TimerStatus } from '@prisma/client';
import { StartTimerDto } from './time-tracking.dto';

@Injectable()
export class TimerService {
  constructor(private readonly prisma: PrismaService) {}

  async startTimer(tenantId: string, userId: string, data: StartTimerDto) {
    // Stop any existing running timers
    await this.prisma.timer.updateMany({
      where: { tenantId, userId, status: TimerStatus.RUNNING },
      data: { status: TimerStatus.PAUSED },
    });

    return this.prisma.timer.create({
      data: {
        ...data,
        tenantId,
        userId,
        status: TimerStatus.RUNNING,
      },
    });
  }

  async pauseTimer(tenantId: string, userId: string, timerId: string) {
    // In reality, calculate diff and add to accumulatedSeconds
    return this.prisma.timer.update({
      where: { id: timerId, tenantId, userId },
      data: { status: TimerStatus.PAUSED },
    });
  }

  async stopTimerAndCreateEntry(
    tenantId: string,
    userId: string,
    timerId: string,
  ) {
    const timer = await this.prisma.timer.update({
      where: { id: timerId, tenantId, userId },
      data: { status: TimerStatus.COMPLETED },
    });

    // Create time entry from timer data
    const durationMinutes = Math.max(
      1,
      Math.ceil(timer.accumulatedSeconds / 60),
    );

    return this.prisma.timeEntry.create({
      data: {
        tenantId,
        userId: timer.userId,
        caseId: timer.caseId,
        clientId: timer.clientId,
        date: new Date(),
        durationMinutes,
        description: timer.description || 'Time tracked via timer',
      },
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../infrastructure/database/prisma.service';

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweepDueAndEscalations(): Promise<void> {
    const now = new Date();
    try {
      const due = await this.prisma.notification.updateMany({
        where: { status: 'PENDING', scheduledFor: { lte: now } },
        data: { status: 'SENT', sentAt: now },
      });
      if (due.count > 0) {
        this.logger.log(`Sent ${due.count} deferred notifications`);
      }
      const stale = await this.prisma.notification.findMany({
        where: { status: 'SENT', escalated: false },
        select: {
          id: true,
          tenantId: true,
          membershipId: true,
          createdAt: true,
        },
        take: 200,
      });
      for (const notification of stale) {
        const rule = await this.prisma.notificationRule.findFirst({
          where: {
            tenantId: notification.tenantId,
            enabled: true,
            escalationHours: { not: null },
          },
          select: { escalationHours: true, escalateToMembershipId: true },
        });
        if (
          !rule?.escalationHours ||
          !rule.escalateToMembershipId ||
          notification.createdAt.getTime() + rule.escalationHours * 3_600_000 >
            now.getTime()
        ) {
          continue;
        }
        await this.prisma.notification.create({
          data: {
            tenantId: notification.tenantId,
            membershipId: rule.escalateToMembershipId,
            title: 'Escalation: unacknowledged notification',
            body: `Notification ${notification.id} was not acknowledged within ${rule.escalationHours}h.`,
            channel: 'IN_APP',
            status: 'SENT',
            sentAt: now,
          },
        });
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { escalated: true },
        });
      }
    } catch (error) {
      this.logger.error({
        message: 'Notification sweep failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

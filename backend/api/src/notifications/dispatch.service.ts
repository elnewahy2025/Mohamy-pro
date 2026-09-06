import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PreferenceService } from './preference.service';

export interface DispatchEvent {
  eventType: 'INVOICE_ISSUED' | 'HEARING_SCHEDULED' | 'DEADLINE_CREATED';
  caseId?: string;
  title: string;
  body: string;
}

@Injectable()
export class DispatchService {
  constructor(private readonly preferences: PreferenceService) {}

  async dispatch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    event: DispatchEvent,
  ): Promise<number> {
    const rules = await tx.notificationRule.findMany({
      where: { tenantId, eventType: event.eventType, enabled: true },
    });
    let created = 0;
    for (const rule of rules) {
      const recipients = await this.resolveRecipients(
        tx,
        tenantId,
        rule.audience,
        event.caseId,
      );
      for (const membershipId of recipients) {
        const gate = await this.preferences.channelAllowed(
          tx,
          tenantId,
          membershipId,
          'IN_APP',
          new Date(),
        );
        if (!gate.allowed && !gate.deferUntil) continue;
        await tx.notification.create({
          data: {
            tenantId,
            membershipId,
            title: event.title,
            body: event.body,
            channel: 'IN_APP',
            status: gate.deferUntil ? 'PENDING' : 'SENT',
            relatedType: event.caseId ? 'case' : undefined,
            relatedId: event.caseId,
            scheduledFor: gate.deferUntil,
            sentAt: gate.deferUntil ? null : new Date(),
          },
        });
        created += 1;
      }
    }
    return created;
  }

  private async resolveRecipients(
    tx: Prisma.TransactionClient,
    tenantId: string,
    audience: string,
    caseId?: string,
  ): Promise<string[]> {
    if (audience === 'ALL_MEMBERS') {
      const members = await tx.membership.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { id: true },
      });
      return members.map((member) => member.id);
    }
    if (!caseId) return [];
    const assignments = await tx.caseAssignment.findMany({
      where: { tenantId, caseId, revokedAt: null },
      select: { membershipId: true },
    });
    return [
      ...new Set(assignments.map((assignment) => assignment.membershipId)),
    ];
  }
}

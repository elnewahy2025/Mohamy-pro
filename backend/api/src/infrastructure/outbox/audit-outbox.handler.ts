import { Injectable } from '@nestjs/common';
import type { OutboxMessage, Prisma } from '@prisma/client';

export const AUDIT_OUTBOX_EVENT_TYPES = [
  'auth.login.succeeded',
  'privileged.operation.succeeded',
  'auth.logout',
  'auth.session.revoked',
  'auth.session.refresh_failed',
  'identity.suspended',
  'identity.disabled',
  'identity.deleted',
  'tenant.switch.succeeded',
  'tenant.switch.denied',
  'membership.invitation.created',
  'membership.invitation.accepted',
  'membership.invitation.revoked',
  'membership.invitation.expired',
] as const;

@Injectable()
export class AuditOutboxHandler {
  async handle(
    message: OutboxMessage,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    if (!AUDIT_OUTBOX_EVENT_TYPES.includes(message.eventType as never)) {
      throw new Error('Audit outbox event type is not registered');
    }
    if (
      !isRecord(message.payload) ||
      typeof message.payload.auditEventId !== 'string'
    ) {
      throw new Error('Audit outbox payload is invalid');
    }
    const event = await transaction.auditEvent.findUnique({
      where: { id: message.payload.auditEventId },
      select: { id: true, eventType: true, tenantId: true },
    });
    if (
      !event ||
      event.eventType !== message.eventType ||
      event.tenantId !== message.tenantId
    ) {
      throw new Error(
        'Audit outbox event does not match persisted audit event',
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

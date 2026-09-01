import { Injectable, Logger } from '@nestjs/common';
import type { OutboxMessage } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';

export const AUDIT_EVENT_CREATED_OUTBOX_EVENT = 'audit.event.created';

interface AuditCreatedPayload {
  auditEventId: string;
  correlationId: string;
}

/**
 * Confirmation handler for audit events. The AuditEvent row is written in the
 * same database transaction as the state change it records, so this handler is
 * idempotent: it verifies the event is present and does not re-create it. A
 * duplicate outbox delivery therefore never produces a second audit event.
 *
 * The read runs on the transaction passed by the worker so it executes within
 * the RLS scope established for the job (tenant or delivery).
 */
@Injectable()
export class AuditOutboxHandler {
  private readonly logger = new Logger(AuditOutboxHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(
    message: OutboxMessage,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const payload = parsePayload(message.payload);
    const event = await transaction.auditEvent.findUnique({
      where: { id: payload.auditEventId },
      select: { correlationId: true },
    });
    if (!event) {
      throw new Error(
        `audit.event.created references missing audit event ${payload.auditEventId}`,
      );
    }
    if (event.correlationId !== payload.correlationId) {
      throw new Error(
        `audit.event.created correlation mismatch for ${payload.auditEventId}`,
      );
    }
    this.logger.debug({
      auditEventId: payload.auditEventId,
      correlationId: payload.correlationId,
      status: 'confirmed',
    });
  }
}

function parsePayload(payload: OutboxMessage['payload']): AuditCreatedPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error('audit.event.created payload must be an object');
  }
  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.auditEventId !== 'string' ||
    candidate.auditEventId.trim().length === 0 ||
    typeof candidate.correlationId !== 'string' ||
    candidate.correlationId.trim().length === 0
  ) {
    throw new Error('audit.event.created payload is invalid');
  }
  return {
    auditEventId: candidate.auditEventId,
    correlationId: candidate.correlationId,
  };
}

import { Injectable, Logger } from '@nestjs/common';
import type { OutboxMessage } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export const INVITATION_CREATED_OUTBOX_EVENT = 'membership.invitation.created';

interface InvitationCreatedPayload {
  invitationId: string;
  tenantId: string;
  correlationId: string;
}

/**
 * Confirmation handler for invitation creation. The Invitation row is written
 * in the same transaction as the outbox message, so this handler is idempotent:
 * it verifies the invitation exists and does not re-create it. A duplicate
 * delivery never produces a second invitation.
 *
 * The read runs on the worker's tenant-scoped transaction so it is covered by
 * the outbox/invitation RLS policy for exactly that tenant.
 */
@Injectable()
export class InvitationOutboxHandler {
  private readonly logger = new Logger(InvitationOutboxHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(
    message: OutboxMessage,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const payload = parsePayload(message.payload);
    const invitation = await transaction.invitation.findUnique({
      where: { id: payload.invitationId },
      select: { id: true, tenantId: true },
    });
    if (!invitation) {
      throw new Error(
        `${INVITATION_CREATED_OUTBOX_EVENT} references missing invitation ${payload.invitationId}`,
      );
    }
    if (invitation.tenantId !== payload.tenantId) {
      throw new Error(
        `${INVITATION_CREATED_OUTBOX_EVENT} tenant mismatch for ${payload.invitationId}`,
      );
    }
    this.logger.debug({
      invitationId: payload.invitationId,
      tenantId: payload.tenantId,
      correlationId: payload.correlationId,
      status: 'confirmed',
    });
  }
}

function parsePayload(
  payload: OutboxMessage['payload'],
): InvitationCreatedPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error(
      `${INVITATION_CREATED_OUTBOX_EVENT} payload must be an object`,
    );
  }
  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.invitationId !== 'string' ||
    candidate.invitationId.trim().length === 0 ||
    typeof candidate.tenantId !== 'string' ||
    candidate.tenantId.trim().length === 0 ||
    typeof candidate.correlationId !== 'string' ||
    candidate.correlationId.trim().length === 0
  ) {
    throw new Error(`${INVITATION_CREATED_OUTBOX_EVENT} payload is invalid`);
  }
  return {
    invitationId: candidate.invitationId,
    tenantId: candidate.tenantId,
    correlationId: candidate.correlationId,
  };
}

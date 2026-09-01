import { Injectable } from '@nestjs/common';
import type { OutboxMessage } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export const HEALTH_STATUS_UPDATED_EVENT = 'health.status.updated';

interface HealthStatusPayload {
  healthId: string;
  status: string;
}

@Injectable()
export class HealthStatusOutboxHandler {
  constructor(private readonly prisma: PrismaService) {}

  async handle(
    message: OutboxMessage,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    const payload = parsePayload(message.payload);
    await transaction.health.update({
      where: { id: payload.healthId },
      data: { status: payload.status },
    });
  }
}

function parsePayload(payload: OutboxMessage['payload']): HealthStatusPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error('health.status.updated payload must be an object');
  }
  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.healthId !== 'string' ||
    candidate.healthId.trim().length === 0 ||
    typeof candidate.status !== 'string' ||
    candidate.status.trim().length === 0 ||
    candidate.status.length > 64
  ) {
    throw new Error('health.status.updated payload is invalid');
  }
  return {
    healthId: candidate.healthId,
    status: candidate.status,
  };
}

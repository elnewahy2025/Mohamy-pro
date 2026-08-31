import type { OutboxMessage } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  INVITATION_CREATED_OUTBOX_EVENT,
  InvitationOutboxHandler,
} from './invitation-outbox.handler';

function message(payload: unknown): OutboxMessage {
  return {
    id: 'm-1',
    aggregateType: 'invitation',
    aggregateId: 'inv-1',
    eventType: INVITATION_CREATED_OUTBOX_EVENT,
    payload: payload as OutboxMessage['payload'],
    status: 'PROCESSING',
    error: null,
    attempts: 1,
    availableAt: new Date(),
    claimedAt: new Date(),
    leaseToken: 'lease',
    deadLetteredAt: null,
    createdAt: new Date(),
    processedAt: null,
    tenantId: null,
  };
}

describe('InvitationOutboxHandler', () => {
  it('confirms an invitation that exists in the same tenant', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'inv-1', tenantId: 'tenant-1' });
    const prisma = { invitation: { findUnique } } as unknown as PrismaService;
    const handler = new InvitationOutboxHandler(prisma);
    await expect(
      handler.handle(
        message({ invitationId: 'inv-1', tenantId: 'tenant-1', correlationId: 'c' }),
      ),
    ).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      select: { id: true, tenantId: true },
    });
  });

  it('fails when the referenced invitation is missing', async () => {
    const prisma = {
      invitation: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const handler = new InvitationOutboxHandler(prisma);
    await expect(
      handler.handle(
        message({ invitationId: 'missing', tenantId: 'tenant-1', correlationId: 'c' }),
      ),
    ).rejects.toThrow(/missing invitation/);
  });

  it('rejects an invalid payload', async () => {
    const handler = new InvitationOutboxHandler({
      invitation: { findUnique: jest.fn() },
    } as unknown as PrismaService);
    await expect(
      handler.handle(message({ invitationId: 5 })),
    ).rejects.toThrow(/payload is invalid/);
  });
});

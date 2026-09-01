import type { OutboxMessage } from '@prisma/client';
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
  const transaction = (findUnique: jest.Mock) =>
    ({ invitation: { findUnique } }) as never;

  it('confirms an invitation that exists in the same tenant', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'inv-1', tenantId: 'tenant-1' });
    const handler = new InvitationOutboxHandler({} as never);
    await expect(
      handler.handle(
        message({ invitationId: 'inv-1', tenantId: 'tenant-1', correlationId: 'c' }),
        transaction(findUnique),
      ),
    ).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      select: { id: true, tenantId: true },
    });
  });

  it('fails when the referenced invitation is missing', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const handler = new InvitationOutboxHandler({} as never);
    await expect(
      handler.handle(
        message({ invitationId: 'missing', tenantId: 'tenant-1', correlationId: 'c' }),
        transaction(findUnique),
      ),
    ).rejects.toThrow(/missing invitation/);
  });

  it('rejects an invalid payload', async () => {
    const handler = new InvitationOutboxHandler({} as never);
    await expect(
      handler.handle(
        message({ invitationId: 5 }),
        transaction(jest.fn()),
      ),
    ).rejects.toThrow(/payload is invalid/);
  });
});

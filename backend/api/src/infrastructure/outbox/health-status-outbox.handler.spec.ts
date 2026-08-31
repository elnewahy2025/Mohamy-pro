import type { OutboxMessage } from '@prisma/client';
import { HealthStatusOutboxHandler } from './health-status-outbox.handler';

function message(payload: unknown): OutboxMessage {
  return {
    id: 'outbox-message-1',
    aggregateType: 'Health',
    aggregateId: 'health-1',
    eventType: 'health.status.updated',
    payload: payload as OutboxMessage['payload'],
    tenantId: null,
    status: 'PROCESSING',
    error: null,
    attempts: 1,
    availableAt: new Date(),
    claimedAt: new Date(),
    leaseToken: 'lease-1',
    deadLetteredAt: null,
    createdAt: new Date(),
    processedAt: null,
  };
}

describe('HealthStatusOutboxHandler', () => {
  it('persists a valid health status event', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'health-1' });
    const handler = new HealthStatusOutboxHandler({
      health: { update },
    } as never);

    await handler.handle(message({ healthId: 'health-1', status: 'DEGRADED' }));

    expect(update).toHaveBeenCalledWith({
      where: { id: 'health-1' },
      data: { status: 'DEGRADED' },
    });
  });

  it('rejects malformed payloads before persistence', async () => {
    const update = jest.fn();
    const handler = new HealthStatusOutboxHandler({
      health: { update },
    } as never);

    await expect(
      handler.handle(message({ status: 'DEGRADED' })),
    ).rejects.toThrow('health.status.updated payload is invalid');
    expect(update).not.toHaveBeenCalled();
  });
});

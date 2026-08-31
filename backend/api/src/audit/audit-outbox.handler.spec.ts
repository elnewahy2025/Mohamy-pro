import type { OutboxMessage } from '@prisma/client';
import { AuditOutboxHandler } from './audit-outbox.handler';

function message(payload: unknown): OutboxMessage {
  return {
    id: 'outbox-1',
    aggregateType: 'AuditEvent',
    aggregateId: 'event-1',
    eventType: 'audit.event.created',
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

describe('AuditOutboxHandler', () => {
  it('confirms a persisted audit event without re-creating it', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'event-1', correlationId: 'corr-1' });
    const handler = new AuditOutboxHandler({
      auditEvent: { findUnique },
    } as never);

    await expect(
      handler.handle(
        message({ auditEventId: 'event-1', correlationId: 'corr-1' }),
      ),
    ).resolves.toBeUndefined();

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      select: { correlationId: true },
    });
  });

  it('throws when the referenced audit event is missing', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const handler = new AuditOutboxHandler({
      auditEvent: { findUnique },
    } as never);

    await expect(
      handler.handle(
        message({ auditEventId: 'missing', correlationId: 'corr-1' }),
      ),
    ).rejects.toThrow(/references missing audit event/);
  });

  it('throws on a correlation mismatch for replay safety', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'event-1', correlationId: 'other' });
    const handler = new AuditOutboxHandler({
      auditEvent: { findUnique },
    } as never);

    await expect(
      handler.handle(
        message({ auditEventId: 'event-1', correlationId: 'corr-1' }),
      ),
    ).rejects.toThrow(/correlation mismatch/);
  });

  it('rejects malformed payloads before any lookup', async () => {
    const findUnique = jest.fn();
    const handler = new AuditOutboxHandler({
      auditEvent: { findUnique },
    } as never);

    await expect(handler.handle(message({ auditEventId: 'event-1' }))).rejects
      .toThrow('audit.event.created payload is invalid');
    await expect(
      handler.handle(message('not-an-object')),
    ).rejects.toThrow('payload must be an object');
    expect(findUnique).not.toHaveBeenCalled();
  });
});

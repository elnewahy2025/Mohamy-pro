import { AuditEventService } from './audit-event.service';
import { AUDIT_EVENT_TYPES } from './audit-constants';
import { AuditWriteError } from './audit.errors';

function clientWithCreate(
  create = jest.fn().mockResolvedValue({ id: 'event-1' }),
) {
  return { auditEvent: { create } };
}

describe('AuditEventService', () => {
  it('writes an event with category, outcome, version and derived defaults', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event-1' });
    const client = clientWithCreate(create);
    const service = new AuditEventService(client as never);

    const result = await service.write({
      eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED,
      actorUserId: 'user-1',
      actorMembershipId: 'membership-1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      metadata: { sourceTenantId: 'tenant-0' },
    });

    expect(result).toEqual({ id: 'event-1' });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.eventType).toBe(AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED);
    expect(data.category).toBe('AUDIT');
    expect(data.eventVersion).toBe(1);
    expect(data.outcome).toBe('SUCCEEDED');
    expect(data.correlationId).toBe('corr-1');
    expect(data.metadata).toEqual({ sourceTenantId: 'tenant-0' });
    expect(data.retentionUntil).toBeInstanceOf(Date);
    expect(data.retentionUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('writes through the supplied transaction client when provided', async () => {
    const txCreate = jest.fn().mockResolvedValue({ id: 'event-tx' });
    const client = clientWithCreate(jest.fn());
    const service = new AuditEventService(client as never);
    const transaction = clientWithCreate(txCreate);

    await service.write(
      {
        eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED,
        correlationId: 'corr-1',
      },
      transaction as never,
    );

    expect(txCreate).toHaveBeenCalledTimes(1);
  });

  it('uses the supplied outcome for denial events', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event-1' });
    const service = new AuditEventService(clientWithCreate(create) as never);

    await service.write({
      eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_DENIED,
      outcome: 'DENIED',
      correlationId: 'corr-1',
      targetId: 'tenant-x',
      metadata: { sourceTenantId: 'tenant-0', targetTenantId: 'tenant-x' },
    });

    const data = create.mock.calls[0][0].data;
    expect(data.outcome).toBe('DENIED');
    expect(data.category).toBe('SECURITY');
    expect(data.targetId).toBe('tenant-x');
  });

  it('rejects metadata fields that are not allowlisted for the event type', async () => {
    const service = new AuditEventService(clientWithCreate() as never);

    await expect(
      service.write({
        eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED,
        correlationId: 'corr-1',
        metadata: { secretToken: 'should-not-persist' },
      }),
    ).rejects.toThrow(AuditWriteError);
  });

  it('rejects non-scalar metadata values', async () => {
    const service = new AuditEventService(clientWithCreate() as never);

    await expect(
      service.write({
        eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED,
        correlationId: 'corr-1',
        metadata: { sourceTenantId: { nested: true } },
      }),
    ).rejects.toThrow(AuditWriteError);
  });

  it('wraps database failures as AuditWriteError', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new Error('db down'));
    const service = new AuditEventService(clientWithCreate(create) as never);

    await expect(
      service.write({
        eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED,
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(AuditWriteError);
  });
});

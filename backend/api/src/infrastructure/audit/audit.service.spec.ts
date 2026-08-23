import { AuditService } from './audit.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const CORRELATION_ID = '44444444-4444-4444-8444-444444444444';

function createMetrics() {
  return {
    recordAuditEvent: jest.fn(),
    recordAuditWriteFailure: jest.fn(),
    recordAuditRetentionPurge: jest.fn(),
  };
}

function createTransaction() {
  return {
    auditEvent: {
      create: jest.fn().mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        eventType: 'tenant.switch.succeeded',
      }),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('AuditService', () => {
  it('writes a redacted audit event and matching outbox record in one transaction', async () => {
    const transaction = createTransaction();
    const outbox = { create: jest.fn().mockResolvedValue({}) };
    const prisma = {
      withGlobalOperationContext: jest.fn(),
      withAuditRetentionContext: jest.fn(),
    };
    const service = new AuditService(
      outbox as never,
      prisma as never,
      createMetrics() as never,
    );

    await service.recordInTransaction(
      {
        eventType: 'tenant.switch.succeeded',
        category: 'AUDIT',
        outcome: 'SUCCEEDED',
        actorUserId: USER_ID,
        actorMembershipId: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        targetType: 'Tenant',
        targetId: TENANT_ID,
        policy: 'CanSwitchTenant',
        reasonCode: 'membership_active',
        correlationId: CORRELATION_ID,
        metadata: {
          sourceTenantId: null,
          targetTenantId: TENANT_ID,
        },
      },
      transaction as never,
    );

    expect(transaction.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'tenant.switch.succeeded',
          actorUserId: USER_ID,
          actorMembershipId: MEMBERSHIP_ID,
          tenantId: TENANT_ID,
          metadata: { sourceTenantId: null, targetTenantId: TENANT_ID },
          payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(outbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'TENANT',
        aggregateType: 'AuditEvent',
        eventType: 'tenant.switch.succeeded',
        correlationId: CORRELATION_ID,
      }),
      transaction,
    );
  });

  it('rejects unallowlisted metadata before persistence', async () => {
    const transaction = createTransaction();
    const outbox = { create: jest.fn() };
    const service = new AuditService(
      outbox as never,
      {} as never,
      createMetrics() as never,
    );

    await expect(
      service.recordInTransaction(
        {
          eventType: 'auth.logout',
          category: 'AUDIT',
          outcome: 'REVOKED',
          actorUserId: USER_ID,
          targetType: 'AppSession',
          targetId: USER_ID,
          correlationId: CORRELATION_ID,
          metadata: { cookie: 'never-persist' },
        },
        transaction as never,
      ),
    ).rejects.toThrow('unknown field');
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects tenant events without a server-derived actor membership', async () => {
    const service = new AuditService(
      { create: jest.fn() } as never,
      {} as never,
    );

    await expect(
      service.recordInTransaction(
        {
          eventType: 'tenant.switch.succeeded',
          category: 'AUDIT',
          outcome: 'SUCCEEDED',
          actorUserId: USER_ID,
          tenantId: TENANT_ID,
          correlationId: CORRELATION_ID,
          metadata: {},
        },
        createTransaction() as never,
      ),
    ).rejects.toThrow('actor user and membership');
  });

  it('rejects a retention boundary shorter than seven years', async () => {
    const service = new AuditService(
      { create: jest.fn() } as never,
      {} as never,
    );
    const occurredAt = new Date('2026-01-01T00:00:00.000Z');

    await expect(
      service.recordInTransaction(
        {
          eventType: 'auth.logout',
          category: 'AUDIT',
          outcome: 'REVOKED',
          actorUserId: USER_ID,
          targetType: 'AppSession',
          targetId: USER_ID,
          correlationId: CORRELATION_ID,
          occurredAt,
          retentionUntil: new Date('2026-01-02T00:00:00.000Z'),
          metadata: {},
        },
        createTransaction() as never,
      ),
    ).rejects.toThrow('shorter than policy');
  });
});

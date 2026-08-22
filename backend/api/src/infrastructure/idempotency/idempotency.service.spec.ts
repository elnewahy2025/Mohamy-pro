import type { IdempotencyKey } from '@prisma/client';
import {
  createRequestFingerprint,
  IdempotencyService,
  type IdempotencyRequest,
} from './idempotency.service';

const tenantContext = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  membershipId: '33333333-3333-4333-8333-333333333333',
  operationId: '44444444-4444-4444-8444-444444444444',
};

const request: IdempotencyRequest = {
  key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  method: 'post',
  path: '/api/v1/tenants',
  contentType: 'application/json',
  body: { name: 'Mohamy', tags: ['legal', 'operations'] },
};

function record(overrides: Partial<IdempotencyKey> = {}): IdempotencyKey {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    key: request.key,
    actorScope: tenantContext.userId,
    tenantScope: tenantContext.tenantId,
    userId: tenantContext.userId,
    tenantId: tenantContext.tenantId,
    httpMethod: 'POST',
    requestPath: request.path,
    requestFingerprint: createRequestFingerprint(request, {
      actorScope: tenantContext.userId,
      tenantScope: tenantContext.tenantId,
      httpMethod: 'POST',
      requestPath: request.path,
    }),
    state: 'RESERVED',
    responseStatus: null,
    responseBody: null,
    responseHeaders: null,
    reservationLeaseUntil: new Date(Date.now() + 60_000),
    reservationVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

describe('IdempotencyService', () => {
  it('canonicalizes object key order into the same fingerprint', () => {
    const left = createRequestFingerprint(request, {
      actorScope: tenantContext.userId,
      tenantScope: tenantContext.tenantId,
    });
    const right = createRequestFingerprint(
      { ...request, body: { tags: ['legal', 'operations'], name: 'Mohamy' } },
      {
        actorScope: tenantContext.userId,
        tenantScope: tenantContext.tenantId,
      },
    );

    expect(left).toBe(right);
  });

  it('rejects non-UUIDv4 keys before opening a transaction', async () => {
    const withTenantContext = jest.fn();
    const service = new IdempotencyService({ withTenantContext } as never);

    await expect(
      service.register({
        request: { ...request, key: '11111111-1111-1111-8111-111111111111' },
        scope: { kind: 'TENANT', tenantContext },
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow('Idempotency-Key must be a UUIDv4');
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('returns RESERVED for the first request and COMPLETED for a matching replay', async () => {
    const created = record();
    const completed = record({
      state: 'COMPLETED',
      responseStatus: 201,
      responseBody: { success: true, data: { id: 'resource-1' } },
      reservationLeaseUntil: null,
      reservationVersion: 2,
    });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completed);
    const create = jest.fn().mockResolvedValue(created);
    const transaction = {
      idempotencyKey: { findUnique, create },
    };
    const prisma = {
      withTenantContext: jest
        .fn()
        .mockImplementation(
          (_context: unknown, callback: (tx: unknown) => Promise<unknown>) =>
            callback(transaction),
        ),
    };
    const service = new IdempotencyService(prisma as never);

    await expect(
      service.register({
        request,
        scope: { kind: 'TENANT', tenantContext },
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toMatchObject({ kind: 'RESERVED', record: created });

    await expect(
      service.findValid(request, { kind: 'TENANT', tenantContext }),
    ).resolves.toMatchObject({ kind: 'REPLAY', record: completed });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          key: request.key,
          actorScope: tenantContext.userId,
          tenantScope: tenantContext.tenantId,
          httpMethod: 'POST',
          requestPath: request.path,
          state: 'RESERVED',
        }),
      }),
    );
  });

  it('returns conflict for changed body or scope and in-progress for an active reservation', async () => {
    const active = record();
    const findUnique = jest.fn().mockResolvedValue(active);
    const transaction = { idempotencyKey: { findUnique } };
    const prisma = {
      withTenantContext: jest
        .fn()
        .mockImplementation(
          (_context: unknown, callback: (tx: unknown) => Promise<unknown>) =>
            callback(transaction),
        ),
    };
    const service = new IdempotencyService(prisma as never);

    await expect(
      service.findValid(
        { ...request, body: { name: 'changed' } },
        { kind: 'TENANT', tenantContext },
      ),
    ).resolves.toEqual({ kind: 'CONFLICT' });

    await expect(
      service.findValid(request, {
        kind: 'TENANT',
        tenantContext: {
          ...tenantContext,
          userId: '66666666-6666-4666-8666-666666666666',
        },
      }),
    ).resolves.toEqual({ kind: 'CONFLICT' });

    await expect(
      service.findValid(request, { kind: 'TENANT', tenantContext }),
    ).resolves.toEqual({ kind: 'IN_PROGRESS' });
  });

  it('completes a reservation only once with an ownership and version check', async () => {
    const current = record();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({
        ...current,
        state: 'COMPLETED',
        responseStatus: 201,
        responseBody: { success: true },
        reservationLeaseUntil: null,
        reservationVersion: 2,
      });
    const transaction = {
      idempotencyKey: {
        findUnique,
        updateMany,
        findUniqueOrThrow: findUnique,
      },
    };
    const prisma = {
      withTenantContext: jest
        .fn()
        .mockImplementation(
          (_context: unknown, callback: (tx: unknown) => Promise<unknown>) =>
            callback(transaction),
        ),
    };
    const service = new IdempotencyService(prisma as never);

    await expect(
      service.complete(
        request,
        { kind: 'TENANT', tenantContext },
        {
          responseStatus: 201,
          responseBody: { success: true },
        },
      ),
    ).resolves.toMatchObject({ state: 'COMPLETED', responseStatus: 201 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          id: current.id,
          state: { in: ['RESERVED', 'RETRYABLE'] },
          reservationVersion: current.reservationVersion,
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          state: 'COMPLETED',
          reservationVersion: { increment: 1 },
        }),
      }),
    );
  });
});

import { Prisma } from '@prisma/client';
import { IdempotencyService } from './idempotency.service';
import { ReserveIdempotencyInput } from './idempotency.types';
import { IdempotencyConflictError } from './idempotency-errors';

function prismaMock() {
  return {
    idempotencyKey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

const metricsMock = {
  recordIdempotencyOutcome: jest.fn(),
};

const baseReserve: ReserveIdempotencyInput = {
  key: '00000000-0000-4000-8000-000000000001',
  actorScope: 'user-a',
  tenantScope: 'tenant-a',
  method: 'POST',
  route: '/api/v1/tenants/tenant-a/roles',
  fingerprint: 'fp-1',
  expiresAt: new Date(Date.now() + 60_000),
};

const uuid = '00000000-0000-4000-8000-000000000001';

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid,
    key: baseReserve.key,
    actorScope: 'user-a',
    tenantScope: 'tenant-a',
    method: 'POST',
    route: '/api/v1/tenants/tenant-a/roles',
    fingerprint: 'fp-1',
    state: 'COMPLETED',
    responseStatus: 201,
    responseBody: { success: true } as Prisma.InputJsonValue,
    responseHeaders: null,
    attemptVersion: 1,
    reservedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    requestId: null,
    ...overrides,
  } as any;
}

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let prisma: ReturnType<typeof prismaMock>;

  beforeEach(() => {
    prisma = prismaMock();
    jest.clearAllMocks();
    service = new IdempotencyService(prisma as any, metricsMock as any);
  });

  it('reserves a new request and returns "reserved"', async () => {
    const created = record({ state: 'RESERVED', responseStatus: null });
    prisma.idempotencyKey.create.mockResolvedValue(created);

    const result = await service.reserve(baseReserve);

    expect(result.outcome).toBe('reserved');
    expect(result.record.id).toBe(uuid);
    expect(prisma.idempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: baseReserve.key,
          actorScope: 'user-a',
          tenantScope: 'tenant-a',
          method: 'POST',
          fingerprint: 'fp-1',
          state: 'RESERVED',
        }),
      }),
    );
  });

  it('replays a completed request with the same scope and fingerprint', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    prisma.idempotencyKey.create.mockRejectedValue(conflict);
    const existing = record();
    prisma.idempotencyKey.findFirst.mockResolvedValue(existing);

    const result = await service.reserve(baseReserve);

    expect(result.outcome).toBe('replay');
    expect(metricsMock.recordIdempotencyOutcome).toHaveBeenCalledWith('replay');
  });

  it('throws IDEMPOTENCY_CONFLICT when fingerprint differs', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    prisma.idempotencyKey.create.mockRejectedValue(conflict);
    prisma.idempotencyKey.findFirst.mockResolvedValue(
      record({ fingerprint: 'different-fp' }),
    );

    await expect(service.reserve(baseReserve)).rejects.toThrow(
      IdempotencyConflictError,
    );
    expect(metricsMock.recordIdempotencyOutcome).toHaveBeenCalledWith(
      'conflict',
    );
  });

  it('throws IDEMPOTENCY_IN_PROGRESS for a reserved non-terminal request', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    prisma.idempotencyKey.create.mockRejectedValue(conflict);
    prisma.idempotencyKey.findFirst.mockResolvedValue(
      record({ state: 'RESERVED', responseStatus: null }),
    );

    await expect(service.reserve(baseReserve)).rejects.toThrow(
      IdempotencyConflictError,
    );
    expect(metricsMock.recordIdempotencyOutcome).toHaveBeenCalledWith(
      'in_progress',
    );
  });

  it('never returns another actor scope on a raw key collision', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    prisma.idempotencyKey.create.mockRejectedValue(conflict);
    prisma.idempotencyKey.findFirst.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'x',
      }),
    );

    await expect(service.reserve(baseReserve)).rejects.toBeTruthy();
    expect(prisma.idempotencyKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorScope: 'user-a',
          tenantScope: 'tenant-a',
          method: 'POST',
        }),
      }),
    );
  });

  it('completes a reserved record with response status and body', async () => {
    prisma.idempotencyKey.update.mockResolvedValue(record());

    await service.complete({
      id: uuid,
      fingerprint: 'fp-1',
      responseStatus: 201,
      responseBody: '{"ok":true}',
    });

    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'COMPLETED',
          responseStatus: 201,
          attemptVersion: { increment: 1 },
        }),
      }),
    );
  });

  it('purges expired records', async () => {
    prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 3 });
    await expect(service.purgeExpired(new Date())).resolves.toBe(3);
  });
});

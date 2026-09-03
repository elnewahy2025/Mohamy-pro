import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { OutboxMessage } from '@prisma/client';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { OutboxService, type OutboxJobPayload } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const message: OutboxMessage = {
  id: 'message-1',
  aggregateType: 'TestAggregate',
  aggregateId: 'aggregate-1',
  eventType: 'test.created',
  payload: { value: 'ok' },
  tenantId,
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

const scopePrisma = {
  withWorkerTenantContext: async (
    _tenant: string,
    _operation: string,
    cb: (tx: unknown) => Promise<void>,
  ) => cb({}),
  withDeliveryScope: async (cb: (tx: unknown) => Promise<void>) => cb({}),
} as never;

describe('outbox delivery semantics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not mark a message processed when only queue submission succeeds', async () => {
    const enqueue = jest.fn().mockResolvedValue({ id: 'outbox:message-1' });
    const prisma = {
      $transaction: jest.fn(),
      withDeliveryScope: async (cb: (tx: unknown) => Promise<void>) => cb({}),
      outboxMessage: {
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new OutboxService(prisma as never, { enqueue } as never);
    jest.spyOn(service, 'claimBatch').mockResolvedValue([message]);
    const markProcessed = jest.spyOn(service, 'markProcessed');

    await expect(service.dispatchBatch()).resolves.toBe(1);

    expect(enqueue).toHaveBeenCalledWith(
      'outbox.dispatch',
      { outboxMessageId: 'message-1', attempt: 1, tenantId },
      { jobId: 'outbox-message-1-attempt-1' },
    );
    expect(markProcessed).not.toHaveBeenCalled();
  });

  it('marks a message processed only after its registered handler succeeds', async () => {
    const outbox = {
      getById: jest.fn().mockResolvedValue(message),
      markProcessed: jest.fn().mockResolvedValue(true),
      recordFailure: jest.fn(),
    };
    const registry = new OutboxHandlerRegistry();
    const handler = jest.fn().mockResolvedValue(undefined);
    registry.register('test.created', handler);
    const worker = new OutboxWorker(
      { getClient: jest.fn() } as never,
      outbox as never,
      registry,
      scopePrisma,
    );
    const process = Reflect.get(worker, 'process') as (
      job: Job<OutboxJobPayload>,
    ) => Promise<void>;

    await process.call(worker, {
      data: { outboxMessageId: 'message-1', attempt: 1, tenantId },
      id: 'job-1',
    } as Job<OutboxJobPayload>);

    expect(handler).toHaveBeenCalledWith(message, expect.anything());
    expect(outbox.markProcessed).toHaveBeenCalledWith(
      'message-1',
      'lease-1',
      expect.anything(),
    );
    expect(outbox.recordFailure).not.toHaveBeenCalled();
  });

  it('rejects unknown event types instead of treating them as successful', () => {
    const registry = new OutboxHandlerRegistry();

    expect(() => registry.resolve('unknown.event')).toThrow(
      'No outbox handler registered for event type unknown.event',
    );
  });

  it('moves an exhausted message to the dead-letter state', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      outboxMessage: {
        findUnique: jest.fn().mockResolvedValue({
          ...message,
          attempts: 5,
        }),
        updateMany,
      },
    };
    const service = new OutboxService(prisma as never, {} as never);

    await expect(
      service.recordFailure('message-1', 'permanent failure', 'lease-1'),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'message-1', status: 'PROCESSING', leaseToken: 'lease-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'DEAD_LETTER' }),
      }),
    );
  });

  it('records a failure and does not mark a message processed when its handler throws', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const outbox = {
      getById: jest.fn().mockResolvedValue(message),
      markProcessed: jest.fn(),
      recordFailure: jest.fn().mockResolvedValue(true),
    };
    const registry = new OutboxHandlerRegistry();
    registry.register(
      'test.created',
      jest.fn().mockRejectedValue(new Error('handler failed')),
    );
    const worker = new OutboxWorker(
      { getClient: jest.fn() } as never,
      outbox as never,
      registry,
      scopePrisma,
    );
    const process = Reflect.get(worker, 'process') as (
      job: Job<OutboxJobPayload>,
    ) => Promise<void>;

    await process.call(worker, {
      data: { outboxMessageId: 'message-1', attempt: 1, tenantId },
      id: 'job-1',
    } as Job<OutboxJobPayload>);

    expect(outbox.markProcessed).not.toHaveBeenCalled();
    expect(outbox.recordFailure).toHaveBeenCalledWith(
      'message-1',
      'handler failed',
      null,
      expect.anything(),
    );
    expect(loggerError).toHaveBeenCalledWith(
      {
        outboxMessageId: 'message-1',
        errorName: 'Error',
        errorMessage:
          'Outbox handler failed; retry or dead-letter state recorded',
      },
      'Outbox handler failed; retry or dead-letter state recorded',
    );
  });
});

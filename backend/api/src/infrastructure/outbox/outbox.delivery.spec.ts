import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { OutboxMessage } from '@prisma/client';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import {
  assertOutboxJobPayload,
  OutboxService,
  type OutboxJobPayload,
} from './outbox.service';
import { OutboxWorker } from './outbox.worker';

const message: OutboxMessage = {
  id: 'message-1',
  tenantId: null,
  scope: 'GLOBAL',
  aggregateType: 'TestAggregate',
  aggregateId: 'aggregate-1',
  eventType: 'test.created',
  eventVersion: 1,
  payload: { value: 'ok' },
  correlationId: null,
  traceparent: null,
  contextUserId: null,
  contextMembershipId: null,
  operationId: null,
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

const globalJob = {
  outboxMessageId: 'message-1',
  attempt: 1,
  scope: 'GLOBAL' as const,
  eventVersion: 1,
};

describe('outbox delivery semantics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not mark a message processed when only queue submission succeeds', async () => {
    const enqueue = jest.fn().mockResolvedValue({ id: 'outbox:message-1' });
    const prisma = { withOutboxDispatcherContext: jest.fn() };
    const service = new OutboxService(prisma as never, { enqueue } as never);
    jest.spyOn(service, 'claimBatch').mockResolvedValue([message]);
    const markProcessed = jest.spyOn(service, 'markProcessed');

    await expect(service.dispatchBatch()).resolves.toBe(1);

    expect(enqueue).toHaveBeenCalledWith('outbox.dispatch', globalJob, {
      jobId: 'outbox-message-1-attempt-1',
    });
    expect(markProcessed).not.toHaveBeenCalled();
  });

  it('marks a message processed only after its registered handler succeeds', async () => {
    const transaction = {};
    const outbox = {
      getByJob: jest.fn().mockResolvedValue(message),
      runInTenantContext: jest
        .fn()
        .mockImplementation(
          (_message: OutboxMessage, callback: (tx: unknown) => Promise<void>) =>
            callback(transaction),
        ),
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
    );
    const process = Reflect.get(worker, 'process') as (
      job: Job<OutboxJobPayload>,
    ) => Promise<void>;

    await process.call(worker, {
      data: globalJob,
      id: 'job-1',
    } as Job<OutboxJobPayload>);

    expect(outbox.getByJob).toHaveBeenCalledWith(globalJob);
    expect(handler).toHaveBeenCalledWith(message, transaction);
    expect(outbox.markProcessed).toHaveBeenCalledWith('message-1', 'lease-1');
    expect(outbox.recordFailure).not.toHaveBeenCalled();
  });

  it('rejects a forged tenant scope before handler execution', async () => {
    const outbox = {
      getByJob: jest.fn().mockRejectedValue(new Error('scope mismatch')),
    };
    const registry = new OutboxHandlerRegistry();
    const handler = jest.fn().mockResolvedValue(undefined);
    registry.register('test.created', handler);
    const worker = new OutboxWorker(
      { getClient: jest.fn() } as never,
      outbox as never,
      registry,
    );
    const process = Reflect.get(worker, 'process') as (
      job: Job<OutboxJobPayload>,
    ) => Promise<void>;

    await expect(
      process.call(worker, {
        data: {
          ...globalJob,
          scope: 'TENANT',
          tenantId: '11111111-1111-4111-8111-111111111111',
          contextUserId: '22222222-2222-4222-8222-222222222222',
          contextMembershipId: '33333333-3333-4333-8333-333333333333',
          operationId: '44444444-4444-4444-8444-444444444444',
        },
        id: 'job-forged',
      } as Job<OutboxJobPayload>),
    ).rejects.toThrow('scope mismatch');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects malformed outbox job context before database access', () => {
    expect(() =>
      assertOutboxJobPayload({
        ...globalJob,
        scope: 'TENANT',
        tenantId: 'not-a-uuid',
        contextUserId: '22222222-2222-4222-8222-222222222222',
        contextMembershipId: '33333333-3333-4333-8333-333333333333',
        operationId: '44444444-4444-4444-8444-444444444444',
      }),
    ).toThrow('tenantId');
  });

  it('rejects unknown event types instead of treating them as successful', () => {
    const registry = new OutboxHandlerRegistry();

    expect(() => registry.resolve('unknown.event')).toThrow(
      'No outbox handler registered for event type unknown.event',
    );
  });

  it('moves an exhausted message to the dead-letter state', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      outboxMessage: {
        findUnique: jest.fn().mockResolvedValue({ ...message, attempts: 5 }),
        updateMany,
      },
    };
    const prisma = {
      withOutboxDispatcherContext: jest
        .fn()
        .mockImplementation(
          (_operationId: string, callback: (tx: unknown) => Promise<unknown>) =>
            callback(transaction),
        ),
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

  it('uses the database clock when scheduling a retry', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const updateMany = jest.fn();
    const transaction = {
      outboxMessage: {
        findUnique: jest.fn().mockResolvedValue(message),
        updateMany,
      },
      $executeRaw: executeRaw,
    };
    const prisma = {
      withOutboxDispatcherContext: jest
        .fn()
        .mockImplementation(
          (_operationId: string, callback: (tx: unknown) => Promise<unknown>) =>
            callback(transaction),
        ),
    };
    const service = new OutboxService(prisma as never, {} as never);

    await expect(
      service.recordFailure('message-1', 'temporary failure', 'lease-1'),
    ).resolves.toBe(true);

    expect(updateMany).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [template] = executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(template.join('')).toContain('CURRENT_TIMESTAMP');
    expect(template.join('')).toContain('"availableAt"');
    expect(template.join('')).toContain('"leaseToken"');
  });

  it('records a failure and does not mark a message processed when its handler throws', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const outbox = {
      getByJob: jest.fn().mockResolvedValue(message),
      runInTenantContext: jest
        .fn()
        .mockRejectedValue(new Error('handler failed')),
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
    );
    const process = Reflect.get(worker, 'process') as (
      job: Job<OutboxJobPayload>,
    ) => Promise<void>;

    await process.call(worker, {
      data: globalJob,
      id: 'job-1',
    } as Job<OutboxJobPayload>);

    expect(outbox.markProcessed).not.toHaveBeenCalled();
    expect(outbox.recordFailure).toHaveBeenCalledWith(
      'message-1',
      'handler failed',
      'lease-1',
    );
    expect(loggerError).toHaveBeenCalledWith(
      {
        outboxMessageId: 'message-1',
        eventType: 'test.created',
        errorName: 'Error',
        errorMessage:
          'Outbox handler failed; retry or dead-letter state recorded',
      },
      'Outbox handler failed; retry or dead-letter state recorded',
    );
  });
});

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { ApiError } from './api-error';
import { IdempotencyService } from '../../infrastructure/idempotency/idempotency.service';

const KEY = '00000000-0000-4000-8000-000000000001';

function ctx(
  method: string,
  originalUrl: string,
  body: unknown,
  key?: string,
): ExecutionContext {
  const request = {
    method,
    originalUrl,
    body,
    header: (name: string) => {
      const lower = name.toLowerCase();
      if (lower === 'idempotency-key') return key;
      if (lower === 'content-type') return 'application/json';
      if (lower === 'x-correlation-id') return 'req-1';
      return undefined;
    },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({
        statusCode: 201,
        setHeader: jest.fn(),
        status: jest.fn(),
      }),
    }),
  } as unknown as ExecutionContext;
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    key: KEY,
    actorScope: null,
    tenantScope: null,
    tenantId: null,
    method: 'POST',
    route: '/x',
    fingerprint: 'fp',
    state: 'COMPLETED',
    responseStatus: 201,
    responseBody: { id: 'created' },
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

describe('IdempotencyInterceptor', () => {
  it('requires an Idempotency-Key header on mutations', async () => {
    const service = { reserve: jest.fn() } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(service);
    const next: CallHandler = { handle: () => of({}) };
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx('POST', '/api/v1/x', {}), next) as any,
      ),
    ).rejects.toThrow(ApiError);
  });

  it('rejects a non-UUIDv4 key', async () => {
    const service = { reserve: jest.fn() } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(service);
    const next: CallHandler = { handle: () => of({}) };
    await expect(
      lastValueFrom(
        interceptor.intercept(
          ctx('POST', '/api/v1/x', {}, 'not-a-uuid'),
          next,
        ) as any,
      ),
    ).rejects.toThrow(ApiError);
  });

  it('skips idempotency for GET requests', async () => {
    const service = { reserve: jest.fn() } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(service);
    const next: CallHandler = { handle: () => of({ data: 1 }) };
    const result = await lastValueFrom(
      interceptor.intercept(ctx('GET', '/api/v1/x', {}), next) as any,
    );
    expect(result).toEqual({ data: 1 });
    expect(
      (service as unknown as { reserve: jest.Mock }).reserve,
    ).not.toHaveBeenCalled();
  });

  it('executes handler on a fresh reservation and completes the record', async () => {
    const service = {
      reserve: jest.fn().mockResolvedValue({
        outcome: 'reserved',
        record: record({ state: 'RESERVED', responseStatus: null }),
      }),
      complete: jest.fn().mockResolvedValue(record()),
    } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(service);
    const next: CallHandler = { handle: () => of({ id: 'created' }) };
    const setHeader = jest.fn();
    const freshCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/v1/x',
          body: { a: 1 },
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'idempotency-key') return KEY;
            if (lower === 'content-type') return 'application/json';
            if (lower === 'x-correlation-id') return 'req-1';
            return undefined;
          },
        }),
        getResponse: () => ({
          statusCode: 201,
          setHeader,
          status: jest.fn(),
        }),
      }),
    } as unknown as ExecutionContext;
    const result = await lastValueFrom(
      interceptor.intercept(freshCtx, next) as any,
    );
    expect(result).toEqual({ id: 'created' });
    expect(setHeader).toHaveBeenCalledWith('Idempotency-Key', KEY);
    expect(
      (service as unknown as { complete: jest.Mock }).complete,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec-1', responseStatus: 201 }),
    );
  });

  it('replays a completed record without calling the handler', async () => {
    const service = {
      reserve: jest.fn().mockResolvedValue({
        outcome: 'replay',
        record: record({ responseBody: { id: 'stored' } }),
      }),
    } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(service);
    const next: CallHandler = {
      handle: jest.fn().mockReturnValue(of({ nope: true })),
    };
    const setHeader = jest.fn();
    const replayCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/v1/x',
          body: { a: 1 },
          header: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'idempotency-key') return KEY;
            if (lower === 'content-type') return 'application/json';
            if (lower === 'x-correlation-id') return 'req-1';
            return undefined;
          },
        }),
        getResponse: () => ({
          statusCode: 201,
          setHeader,
          status: jest.fn(),
        }),
      }),
    } as unknown as ExecutionContext;
    const result = await lastValueFrom(
      interceptor.intercept(replayCtx, next) as any,
    );
    expect(result).toEqual({ id: 'stored' });
    expect(
      (next as unknown as { handle: jest.Mock }).handle,
    ).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith('Idempotency-Key', KEY);
  });

  it('scopes the idempotency record to the authenticated session actor', async () => {
    const service = {
      reserve: jest.fn().mockResolvedValue({
        outcome: 'reserved',
        record: record({ state: 'RESERVED', responseStatus: null }),
      }),
      complete: jest.fn().mockResolvedValue(record()),
    } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(service);
    const next: CallHandler = { handle: () => of({ ok: true }) };
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/session/tenant-switch',
      body: { tenantId: 't-1' },
      auth: { userId: 'user-1', activeTenantId: null },
      header: (name: string) => {
        const lower = name.toLowerCase();
        if (lower === 'idempotency-key') return KEY;
        if (lower === 'content-type') return 'application/json';
        if (lower === 'x-correlation-id') return 'req-1';
        return undefined;
      },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({
          statusCode: 200,
          setHeader: jest.fn(),
          status: jest.fn(),
        }),
      }),
    } as unknown as ExecutionContext;
    await lastValueFrom(interceptor.intercept(context, next) as any);
    expect(
      (service as unknown as { reserve: jest.Mock }).reserve,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorScope: 'user-1',
        tenantScope: null,
        route: '/session/tenant-switch',
      }),
    );
  });

  it('propagates a conflict from the service', async () => {
    const service = {
      reserve: jest
        .fn()
        .mockRejectedValue(
          new ApiError({ status: 409, code: 'IDEMPOTENCY_CONFLICT' }),
        ),
    } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(service);
    const next: CallHandler = { handle: () => of({}) };
    await expect(
      lastValueFrom(
        interceptor.intercept(
          ctx('POST', '/api/v1/x', { a: 1 }, KEY),
          next,
        ) as any,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});

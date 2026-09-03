import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { SuccessEnvelopeInterceptor } from './success-envelope.interceptor';
import type { ApiSuccessEnvelope } from './envelope';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

function executionContext(originalUrl: string): ExecutionContext {
  const request = {
    originalUrl,
    header: (name: string) =>
      name.toLowerCase() === CORRELATION_ID_HEADER ? 'req-1234' : undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SuccessEnvelopeInterceptor', () => {
  const interceptor = new SuccessEnvelopeInterceptor();

  it('wraps an object response in the success envelope', async () => {
    const next: CallHandler = { handle: () => of({ id: 'x' }) };
    const result = await lastValueFrom(
      interceptor.intercept(executionContext('/api/v1/users'), next),
    );
    expect(result).toEqual({
      success: true,
      data: { id: 'x' },
      meta: {
        requestId: 'req-1234',
        timestamp: expect.any(String),
        pagination: null,
      },
    });
  });

  it('wraps array responses without pagination', async () => {
    const next: CallHandler = { handle: () => of([1, 2, 3]) };
    const result = await lastValueFrom(
      interceptor.intercept(executionContext('/api/v1/users'), next),
    );
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.meta.pagination).toBeNull();
  });

  it('extracts pagination metadata from paginated handler results', async () => {
    const next: CallHandler = {
      handle: () =>
        of({
          data: [{ id: 'a' }],
          pagination: { page: 1, limit: 20, total: 42 },
        }),
    };
    const result = await lastValueFrom(
      interceptor.intercept(executionContext('/api/v1/users'), next),
    );
    expect(result.data).toEqual([{ id: 'a' }]);
    expect(result.meta.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 42,
    });
  });

  it('passes operational endpoints through without wrapping', async () => {
    const next: CallHandler = { handle: () => of({ status: 'ok' }) };
    const result = await lastValueFrom(
      interceptor.intercept(executionContext('/api/v1/health/live'), next),
    );
    expect(result).toEqual({ status: 'ok' });
  });
});

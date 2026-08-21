import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { ValidatedEnvironment } from '../config/env.validation';
import { MetricsService } from '../observability/metrics.service';
import { RateLimitMiddleware } from './rate-limit.middleware';

function config(): ConfigService<ValidatedEnvironment, true> {
  return {
    get: <T>(key: string, fallback?: T) => {
      const values: Record<string, unknown> = {
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_WINDOW_SECONDS: 60,
        RATE_LIMIT_MAX_REQUESTS: 2,
      };
      return (values[key] as T | undefined) ?? fallback;
    },
    getOrThrow: <T>(key: string) => {
      const values: Record<string, unknown> = {
        RATE_LIMIT_WINDOW_SECONDS: 60,
        RATE_LIMIT_MAX_REQUESTS: 2,
      };
      return values[key] as T;
    },
  } as ConfigService<ValidatedEnvironment, true>;
}

interface TestResponse extends Response {
  body?: unknown;
  statusSpy: jest.Mock;
  setHeaderSpy: jest.Mock;
}

function response(): TestResponse {
  const headers = new Map<string, string>();
  const statusSpy = jest.fn().mockReturnThis();
  const setHeaderSpy = jest.fn((name: string, value: string) => {
    headers.set(name, value);
  });
  const target = {
    status: statusSpy,
    json: jest.fn(function (this: { body?: unknown }, body: unknown) {
      this.body = body;
      return this;
    }),
    setHeader: setHeaderSpy,
    headers,
    statusSpy,
    setHeaderSpy,
  };
  return target as unknown as TestResponse;
}

describe('RateLimitMiddleware', () => {
  it('passes requests below the configured limit and exposes bounded headers', async () => {
    const evalScript = jest.fn().mockResolvedValue(1);
    const recordApplicationErrorSpy = jest.fn();
    const metrics = {
      recordApplicationError: recordApplicationErrorSpy,
    } as unknown as MetricsService;
    const middleware = new RateLimitMiddleware(
      config(),
      { getClient: () => ({ eval: evalScript }) } as never,
      metrics,
    );
    const next = jest.fn() as NextFunction;
    const res = response();

    middleware.use({ ip: '127.0.0.1' } as Request, res, next);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(evalScript).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '2');
    expect(res.setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
  });

  it('returns 429 after the configured limit without calling next', async () => {
    const recordApplicationErrorSpy = jest.fn();
    const metrics = {
      recordApplicationError: recordApplicationErrorSpy,
    } as unknown as MetricsService;
    const middleware = new RateLimitMiddleware(
      config(),
      { getClient: () => ({ eval: jest.fn().mockResolvedValue(3) }) } as never,
      metrics,
    );
    const next = jest.fn() as NextFunction;
    const res = response();

    middleware.use({ ip: '127.0.0.1' } as Request, res, next);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
    expect(res.statusSpy).toHaveBeenCalledWith(429);
    expect(res.body).toEqual({
      statusCode: 429,
      error: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded',
    });
  });

  it('fails closed with 503 when Redis is unavailable', async () => {
    const recordApplicationErrorSpy = jest.fn();
    const metrics = {
      recordApplicationError: recordApplicationErrorSpy,
    } as unknown as MetricsService;
    const middleware = new RateLimitMiddleware(
      config(),
      {
        getClient: () => ({
          eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
        }),
      } as never,
      metrics,
    );
    const next = jest.fn() as NextFunction;
    const res = response();

    middleware.use({ ip: '127.0.0.1' } as Request, res, next);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
    expect(res.statusSpy).toHaveBeenCalledWith(503);
    expect(res.body).toEqual({
      statusCode: 503,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Request protection is temporarily unavailable',
    });
    expect(recordApplicationErrorSpy).toHaveBeenCalledWith('rate_limit');
  });
});

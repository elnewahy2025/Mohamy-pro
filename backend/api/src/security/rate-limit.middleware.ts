import { createHash } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { ValidatedEnvironment } from '../config/env.validation';
import { MetricsService } from '../observability/metrics.service';
import { RedisService } from '../infrastructure/redis/redis.service';

const INCREMENT_WITH_EXPIRY_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(
    private readonly config: ConfigService<ValidatedEnvironment, true>,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (!this.config.get<boolean>('RATE_LIMIT_ENABLED', true)) {
      next();
      return;
    }
    void this.enforce(request, response, next);
  }

  private async enforce(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const windowSeconds = this.config.getOrThrow<number>(
      'RATE_LIMIT_WINDOW_SECONDS',
    );
    const maxRequests = this.config.getOrThrow<number>(
      'RATE_LIMIT_MAX_REQUESTS',
    );
    const bucket = Math.floor(Date.now() / (windowSeconds * 1_000));
    const key = `mohamy:rate-limit:${this.hashClient(request.ip)}:${bucket}`;

    try {
      const rawCount = await this.redis
        .getClient()
        .eval(INCREMENT_WITH_EXPIRY_SCRIPT, 1, key, windowSeconds);
      const count = Number(rawCount);
      if (!Number.isFinite(count)) {
        throw new Error('Rate limiter returned a non-numeric counter');
      }
      const remaining = Math.max(0, maxRequests - count);
      response.setHeader('X-RateLimit-Limit', String(maxRequests));
      response.setHeader('X-RateLimit-Remaining', String(remaining));
      if (count > maxRequests) {
        response.setHeader(
          'Retry-After',
          String(this.retryAfterSeconds(windowSeconds)),
        );
        response.status(429).json({
          statusCode: 429,
          error: 'TOO_MANY_REQUESTS',
          message: 'Rate limit exceeded',
        });
        return;
      }
      next();
    } catch (error) {
      this.metrics.recordApplicationError('rate_limit');
      this.logger.warn(
        {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: 'Rate limiter unavailable',
        },
        'Rate limiter unavailable; request allowed to proceed (fail-open)',
      );
      return next();
    }
  }

  private hashClient(ip: string | undefined): string {
    const normalized = ip?.trim() || 'unknown';
    return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  }

  private retryAfterSeconds(windowSeconds: number): number {
    const elapsed = Math.floor(Date.now() / 1_000) % windowSeconds;
    return Math.max(1, windowSeconds - elapsed);
  }
}

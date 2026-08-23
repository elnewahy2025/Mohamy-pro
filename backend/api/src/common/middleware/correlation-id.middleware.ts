import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { correlationContext } from './correlation-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const headerValue = request.header(CORRELATION_ID_HEADER)?.trim();
    const correlationId =
      headerValue && UUID_V4_PATTERN.test(headerValue)
        ? headerValue
        : randomUUID();

    request.headers[CORRELATION_ID_HEADER] = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    correlationContext.run({ correlationId }, next);
  }
}

export function getCorrelationId(request: Request): string {
  const value = request.header(CORRELATION_ID_HEADER)?.trim();
  return value && UUID_V4_PATTERN.test(value) ? value : 'unknown';
}

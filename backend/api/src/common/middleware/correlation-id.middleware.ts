import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const headerValue = request.header(CORRELATION_ID_HEADER);
    const correlationId = headerValue?.trim() || randomUUID();

    request.headers[CORRELATION_ID_HEADER] = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}

export function getCorrelationId(request: Request): string {
  const value = request.header(CORRELATION_ID_HEADER);
  return value?.trim() || 'unknown';
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getCorrelationId } from '../middleware/correlation-id.middleware';
import { ApiSuccessEnvelope, isPaginatedShape } from './envelope';
import { isOperationalExclusion } from './envelope-exclusions';

@Injectable()
export class SuccessEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    if (isOperationalExclusion(request)) {
      return next.handle();
    }

    return next
      .handle()
      .pipe(map((body: unknown) => this.envelope(request, body)));
  }

  private envelope(request: Request, body: unknown): ApiSuccessEnvelope {
    if (body === null || body === undefined) {
      body = {};
    }
    const requestId = getCorrelationId(request);
    const timestamp = new Date().toISOString();

    if (isPaginatedShape(body)) {
      return {
        success: true,
        data: body.data,
        meta: {
          requestId,
          timestamp,
          pagination: body.pagination,
        },
      };
    }

    return {
      success: true,
      data: body,
      meta: { requestId, timestamp, pagination: null },
    };
  }
}

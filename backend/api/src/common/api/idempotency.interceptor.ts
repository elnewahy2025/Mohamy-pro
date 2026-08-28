import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { getCorrelationId } from '../middleware/correlation-id.middleware';
import { ApiError } from './api-error';
import { isOperationalExclusion } from './envelope-exclusions';
import { isOidcProtocolRoute } from './oidc-protocol-route';
import { computeFingerprint } from './request-fingerprint';
import { IdempotencyService } from '../../infrastructure/idempotency/idempotency.service';
import {
  IDEMPOTENCY_RETRY_AFTER,
  IDEMPOTENCY_KEY_HEADER,
} from '../../infrastructure/idempotency/idempotency-constants';
import { normalizeIdempotencyError } from './idempotency-error-mapping';

const UUIDV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (!this.appliesTo(request)) {
      return next.handle();
    }

    const validationError = validateKey(request);
    if (validationError) {
      return throwError(() => validationError);
    }

    const key = request.header(IDEMPOTENCY_KEY_HEADER)?.trim() as string;
    const { actorScope, tenantScope, route } = resolveScope(request);
    const fingerprint = computeFingerprint(
      request,
      actorScope,
      tenantScope,
      route,
    );
    const requestId = getCorrelationId(request);

    const reservation = from(
      this.idempotency.reserve({
        key,
        actorScope,
        tenantScope,
        method: request.method,
        route,
        fingerprint,
        expiresAt: IdempotencyService.defaultExpiry(),
        requestId,
      }),
    ).pipe(
      catchError((error) => throwError(() => normalizeIdempotencyError(error))),
    );

    return reservation.pipe(
      mergeMap(({ outcome, record }) => {
        if (outcome === 'replay') {
          applyReplay(response, record);
          return of(record.responseBody);
        }
        return next.handle().pipe(
          mergeMap((value) => {
            const status = safeStatus(response.statusCode);
            this.idempotency
              .complete({
                id: record.id,
                fingerprint,
                responseStatus: status,
                responseBody:
                  typeof value === 'string'
                    ? value
                    : JSON.stringify(value ?? {}),
              })
              .catch((error) => {
                this.logger.error(
                  `Failed to complete idempotency record: ${String(error)}`,
                );
              });
            return of(value);
          }),
          catchError((error) => {
            return from(this.handleHandlerError(record.id, error)).pipe(
              mergeMap(() => throwError(() => error)),
            );
          }),
        );
      }),
    );
  }

  private appliesTo(request: Request): boolean {
    if (isOperationalExclusion(request)) {
      return false;
    }
    if (!MUTATION_METHODS.has(request.method?.toUpperCase() ?? '')) {
      return false;
    }
    if (isOidcProtocolRoute(request.path ?? request.originalUrl ?? '')) {
      return false;
    }
    return true;
  }

  private async handleHandlerError(id: string, error: unknown): Promise<void> {
    const status = error instanceof ApiError ? error.getStatus() : undefined;
    const isControlled =
      error instanceof ApiError &&
      status !== undefined &&
      status >= 400 &&
      status < 500;
    if (isControlled) {
      await this.idempotency.markFailed(id).catch(() => undefined);
    } else {
      await this.idempotency.releaseReservation(id).catch(() => undefined);
    }
  }
}

function validateKey(request: Request): ApiError | null {
  const key = request.header(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!key) {
    return ApiError.validationFailed(
      `Missing required header ${IDEMPOTENCY_KEY_HEADER}.`,
    );
  }
  if (!UUIDV4.test(key)) {
    return ApiError.validationFailed(
      `${IDEMPOTENCY_KEY_HEADER} must be a UUIDv4 value.`,
    );
  }
  return null;
}

function resolveScope(request: Request): {
  actorScope: string | null;
  tenantScope: string | null;
  route: string;
} {
  const actor = (request as any).user?.id as string | undefined;
  const tenant = (request as any).tenantId as string | undefined;
  const serviceScope = (request as any).serviceScope as string | undefined;
  return {
    actorScope: serviceScope ?? actor ?? null,
    tenantScope: tenant ?? null,
    route: normalizedRoute(request),
  };
}

function applyReplay(
  response: Response,
  record: { responseStatus: number | null },
): void {
  response.status(record.responseStatus ?? HttpStatus.OK);
  if (IDEMPOTENCY_RETRY_AFTER > 0) {
    response.setHeader(
      'Idempotency-Retry-After',
      String(IDEMPOTENCY_RETRY_AFTER),
    );
  }
}

function normalizedRoute(request: Request): string {
  return (
    request.route?.path ??
    request.path ??
    request.originalUrl ??
    ''
  ).replace(/^\/api\/v\d+/, '');
}

function safeStatus(statusCode: number): number {
  return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 600
    ? statusCode
    : HttpStatus.OK;
}

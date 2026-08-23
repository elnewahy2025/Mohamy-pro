import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { EMPTY, Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import {
  createErrorEnvelope,
  createSuccessEnvelope,
  isApiErrorEnvelope,
} from './api-envelope';
import { getCorrelationId } from '../middleware/correlation-id.middleware';
import { AuthenticationError } from '../../auth/auth.errors';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import {
  IdempotencyService,
  type IdempotencyDecision,
  type IdempotencyRequest,
  type IdempotencyScope,
} from '../../infrastructure/idempotency/idempotency.service';

const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1_000;
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class Phase2BusinessInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const authSession = request.authSession;
    if (!authSession) throw new AuthenticationError();

    const key = request.header('idempotency-key')?.trim();
    if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new BadRequestException('IDEMPOTENCY_KEY_INVALID');
    }

    const idempotencyRequest: IdempotencyRequest = {
      key,
      method: request.method,
      path: request.originalUrl.split('?', 1)[0],
      contentType: request.header('content-type') ?? undefined,
      body: request.body,
    };
    const forceGlobalScope =
      request.originalUrl.split('?', 1)[0] === '/api/v1/session/tenant-switch';
    const scope: IdempotencyScope =
      !forceGlobalScope &&
      authSession.activeTenantId &&
      authSession.activeMembershipId
        ? {
            kind: 'TENANT',
            tenantContext: {
              tenantId: authSession.activeTenantId,
              userId: authSession.userId,
              membershipId: authSession.activeMembershipId,
              operationId: randomUUID(),
            },
          }
        : {
            kind: 'GLOBAL',
            actorScope: authSession.userId,
            operationId: randomUUID(),
          };
    const decision = await this.idempotency.register({
      request: idempotencyRequest,
      scope,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
    });

    if (decision.kind === 'REPLAY') {
      this.replay(response, decision);
      return EMPTY;
    }
    if (decision.kind === 'CONFLICT') {
      throw new ConflictException('IDEMPOTENCY_CONFLICT');
    }
    if (decision.kind === 'IN_PROGRESS') {
      throw new ConflictException('IDEMPOTENCY_IN_PROGRESS');
    }

    return next.handle().pipe(
      mergeMap((data: unknown) =>
        from(
          this.completeSuccess(
            request,
            idempotencyRequest,
            scope,
            decision,
            data,
          ),
        ),
      ),
      catchError((error: unknown) =>
        from(
          this.completeFailure(
            request,
            idempotencyRequest,
            scope,
            decision,
            error,
          ),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }

  private async completeSuccess(
    request: Request,
    idempotencyRequest: IdempotencyRequest,
    scope: IdempotencyScope,
    decision: Extract<IdempotencyDecision, { kind: 'RESERVED' }>,
    data: unknown,
  ): Promise<unknown> {
    const body = createSuccessEnvelope(data, request);
    await this.idempotency.complete(idempotencyRequest, scope, {
      responseStatus: 200,
      responseBody: body as unknown as Prisma.InputJsonValue,
      responseHeaders: { 'x-correlation-id': getCorrelationId(request) },
    });
    return body;
  }

  private async completeFailure(
    request: AuthenticatedRequest,
    idempotencyRequest: IdempotencyRequest,
    scope: IdempotencyScope,
    decision: Extract<IdempotencyDecision, { kind: 'RESERVED' }>,
    error: unknown,
  ): Promise<void> {
    const status =
      error &&
      typeof error === 'object' &&
      'getStatus' in error &&
      typeof (error as { getStatus?: unknown }).getStatus === 'function'
        ? Number((error as { getStatus: () => number }).getStatus())
        : 500;
    if (status >= 500) {
      await this.idempotency.releaseForRetry(
        idempotencyRequest,
        scope,
        new Date(Date.now() + 5 * 60 * 1_000),
      );
      return;
    }
    const body = createErrorEnvelope(error, request);
    request.phase2ErrorEnvelope = body;
    await this.idempotency.complete(idempotencyRequest, scope, {
      responseStatus: status,
      responseBody: body as unknown as Prisma.InputJsonValue,
      responseHeaders: { 'x-correlation-id': getCorrelationId(request) },
      terminalFailure: true,
    });
  }

  private replay(
    response: Response,
    decision: Extract<IdempotencyDecision, { kind: 'REPLAY' }>,
  ): void {
    const headers = decision.record.responseHeaders;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      const correlationId = (headers as { 'x-correlation-id'?: unknown })[
        'x-correlation-id'
      ];
      if (typeof correlationId === 'string') {
        response.setHeader('x-correlation-id', correlationId);
      }
    }
    const body = decision.record.responseBody;
    if (isApiErrorEnvelope(body)) {
      response.status(decision.record.responseStatus ?? 409).json(body);
      return;
    }
    response.status(decision.record.responseStatus ?? 200).json(body);
  }
}

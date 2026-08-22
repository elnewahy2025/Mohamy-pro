import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type IdempotencyKey } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  assertUuidContextField,
  type TenantTransactionContext,
} from '../database/tenant-context';

export interface IdempotencyRequest {
  key: string;
  method: string;
  path: string;
  contentType?: string;
  body: unknown;
}

export type IdempotencyScope =
  | {
      kind: 'TENANT';
      tenantContext: TenantTransactionContext;
    }
  | {
      kind: 'GLOBAL';
      actorScope: string;
      operationId: string;
    };

export interface RegisterIdempotencyInput {
  request: IdempotencyRequest;
  scope: IdempotencyScope;
  expiresAt: Date;
}

export interface IdempotencyCompletion {
  responseStatus: number;
  responseBody: Prisma.InputJsonValue;
  responseHeaders?: Prisma.InputJsonValue;
  terminalFailure?: boolean;
}

export type IdempotencyDecision =
  | { kind: 'RESERVED'; record: IdempotencyKey }
  | { kind: 'REPLAY'; record: IdempotencyKey }
  | { kind: 'CONFLICT' }
  | { kind: 'IN_PROGRESS' };

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async findValid(
    request: IdempotencyRequest,
    scope: IdempotencyScope,
  ): Promise<IdempotencyDecision | null> {
    const normalized = normalizeRequest(request, scope);
    return this.withScope(scope, async (transaction) => {
      const record = await transaction.idempotencyKey.findUnique({
        where: { key: normalized.key },
      });
      if (!record) return null;
      if (record.expiresAt <= new Date()) return null;
      return compareRecord(record, normalized);
    });
  }

  async register(
    input: RegisterIdempotencyInput,
  ): Promise<IdempotencyDecision> {
    const normalized = normalizeRequest(input.request, input.scope);
    const decision = await this.withScope<IdempotencyDecision>(
      input.scope,
      async (transaction) => {
        const existing = await transaction.idempotencyKey.findUnique({
          where: { key: normalized.key },
        });
        if (existing && existing.expiresAt > new Date()) {
          return compareRecord(existing, normalized);
        }
        if (existing) {
          throw new Error(
            'Expired idempotency record requires purge before reuse',
          );
        }

        try {
          const record = await transaction.idempotencyKey.create({
            data: {
              id: randomUUID(),
              key: normalized.key,
              actorScope: normalized.actorScope,
              tenantScope: normalized.tenantScope,
              userId: normalized.userId,
              tenantId: normalized.tenantId,
              httpMethod: normalized.httpMethod,
              requestPath: normalized.requestPath,
              requestFingerprint: normalized.requestFingerprint,
              state: 'RESERVED',
              reservationLeaseUntil: input.expiresAt,
              reservationVersion: 1,
              expiresAt: input.expiresAt,
            },
          });
          return { kind: 'RESERVED', record };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          return { kind: 'CONFLICT' };
        }
      },
    );
    if (decision.kind !== 'CONFLICT') return decision;
    return (await this.findValid(input.request, input.scope)) ?? decision;
  }

  async complete(
    request: IdempotencyRequest,
    scope: IdempotencyScope,
    completion: IdempotencyCompletion,
  ): Promise<IdempotencyKey> {
    const normalized = normalizeRequest(request, scope);
    validateCompletion(completion);
    return this.withScope(scope, async (transaction) => {
      const record = await transaction.idempotencyKey.findUnique({
        where: { key: normalized.key },
      });
      if (!record || !sameScopeAndRequest(record, normalized)) {
        throw new Error(
          'Idempotency record is not owned by this request scope',
        );
      }
      if (record.state !== 'RESERVED' && record.state !== 'RETRYABLE') {
        throw new Error('Idempotency record is already terminal');
      }
      const updated = await transaction.idempotencyKey.updateMany({
        where: {
          id: record.id,
          state: { in: ['RESERVED', 'RETRYABLE'] },
          reservationVersion: record.reservationVersion,
        },
        data: {
          state: completion.terminalFailure ? 'TERMINAL_FAILURE' : 'COMPLETED',
          responseStatus: completion.responseStatus,
          responseBody: completion.responseBody,
          responseHeaders: completion.responseHeaders,
          reservationLeaseUntil: null,
          reservationVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new Error('Idempotency reservation was concurrently changed');
      }
      return transaction.idempotencyKey.findUniqueOrThrow({
        where: { id: record.id },
      });
    });
  }

  async releaseForRetry(
    request: IdempotencyRequest,
    scope: IdempotencyScope,
    leaseUntil: Date,
  ): Promise<boolean> {
    const normalized = normalizeRequest(request, scope);
    return this.withScope(scope, async (transaction) => {
      const record = await transaction.idempotencyKey.findUnique({
        where: { key: normalized.key },
      });
      if (!record || !sameScopeAndRequest(record, normalized)) return false;
      const result = await transaction.idempotencyKey.updateMany({
        where: { id: record.id, state: 'RESERVED' },
        data: {
          state: 'RETRYABLE',
          reservationLeaseUntil: leaseUntil,
          reservationVersion: { increment: 1 },
        },
      });
      return result.count === 1;
    });
  }

  async purgeExpired(now = new Date()): Promise<number> {
    assertDate(now, 'now');
    return this.prisma.withIdempotencyMaintenanceContext(
      randomUUID(),
      async (transaction) => {
        const result = await transaction.idempotencyKey.deleteMany({
          where: { expiresAt: { lte: now } },
        });
        return result.count;
      },
    );
  }

  private withScope<TResult>(
    scope: IdempotencyScope,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    if (scope.kind === 'TENANT') {
      return this.prisma.withTenantContext(scope.tenantContext, callback);
    }
    assertUuidContextField(scope.operationId, 'operationId');
    if (!scope.actorScope.trim()) {
      throw new Error('Global idempotency actor scope is required');
    }
    return this.prisma.withGlobalOperationContext(scope.operationId, callback);
  }
}

interface NormalizedRequest {
  key: string;
  actorScope: string;
  tenantScope: string;
  userId: string | null;
  tenantId: string | null;
  httpMethod: string;
  requestPath: string;
  requestFingerprint: string;
}

function normalizeRequest(
  request: IdempotencyRequest,
  scope: IdempotencyScope,
): NormalizedRequest {
  assertUuidV4(request.key, 'Idempotency-Key');
  const httpMethod = request.method.trim().toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
    throw new Error(
      'Idempotency is required only for state-changing business methods',
    );
  }
  const requestPath = normalizePath(request.path);
  if (scope.kind === 'TENANT') {
    return {
      key: request.key,
      actorScope: scope.tenantContext.userId,
      tenantScope: scope.tenantContext.tenantId,
      userId: scope.tenantContext.userId,
      tenantId: scope.tenantContext.tenantId,
      httpMethod,
      requestPath,
      requestFingerprint: createRequestFingerprint(request, {
        actorScope: scope.tenantContext.userId,
        tenantScope: scope.tenantContext.tenantId,
        httpMethod,
        requestPath,
      }),
    };
  }
  return {
    key: request.key,
    actorScope: scope.actorScope,
    tenantScope: 'GLOBAL',
    userId: null,
    tenantId: null,
    httpMethod,
    requestPath,
    requestFingerprint: createRequestFingerprint(request, {
      actorScope: scope.actorScope,
      tenantScope: 'GLOBAL',
      httpMethod,
      requestPath,
    }),
  };
}

export function createRequestFingerprint(
  request: IdempotencyRequest,
  identity: {
    actorScope: string;
    tenantScope: string;
    httpMethod?: string;
    requestPath?: string;
  },
): string {
  const method = identity.httpMethod ?? request.method.trim().toUpperCase();
  const path = identity.requestPath ?? normalizePath(request.path);
  const material = canonicalJson({
    actorScope: identity.actorScope,
    tenantScope: identity.tenantScope,
    contentType: request.contentType?.trim().toLowerCase() ?? null,
    method,
    path,
    body: request.body,
  });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

function compareRecord(
  record: IdempotencyKey,
  normalized: NormalizedRequest,
): IdempotencyDecision {
  if (!sameScopeAndRequest(record, normalized)) return { kind: 'CONFLICT' };
  if (record.state === 'RESERVED') {
    if (
      record.reservationLeaseUntil &&
      record.reservationLeaseUntil > new Date()
    ) {
      return { kind: 'IN_PROGRESS' };
    }
    return { kind: 'CONFLICT' };
  }
  if (record.state === 'COMPLETED' || record.state === 'TERMINAL_FAILURE') {
    return { kind: 'REPLAY', record };
  }
  return { kind: 'CONFLICT' };
}

function sameScopeAndRequest(
  record: IdempotencyKey,
  normalized: NormalizedRequest,
): boolean {
  return (
    record.actorScope === normalized.actorScope &&
    record.tenantScope === normalized.tenantScope &&
    record.httpMethod === normalized.httpMethod &&
    record.requestPath === normalized.requestPath &&
    record.requestFingerprint === normalized.requestFingerprint
  );
}

function validateCompletion(completion: IdempotencyCompletion): void {
  if (
    !Number.isInteger(completion.responseStatus) ||
    completion.responseStatus < 100 ||
    completion.responseStatus > 599
  ) {
    throw new Error('Idempotency response status is invalid');
  }
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    throw new Error('Idempotency request path must be a normalized path');
  }
  return trimmed.replaceAll(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Idempotency body contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  throw new Error('Idempotency body contains an unsupported value');
}

function assertUuidV4(value: string, fieldName: string): void {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${fieldName} must be a UUIDv4`);
  }
}

function assertDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

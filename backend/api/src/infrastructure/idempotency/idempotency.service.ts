import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type IdempotencyKey } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../../observability/metrics.service';
import {
  CompleteIdempotencyInput,
  ReserveIdempotencyInput,
} from './idempotency.types';
import { IdempotencyConflictError } from './idempotency-errors';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  static defaultExpiry(now = new Date()): Date {
    return new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
  }

  /**
   * Atomically reserve an idempotency record for the given full scope.
   * The composite unique index enforces the scope; concurrent conflicting
   * requests converge on a single winner.
   *
   * The reservation runs before the controller enters its membership-validated
   * tenant context, so it establishes its own server-derived scope: a
   * tenant-scoped key is written under the worker tenant boundary, and an
   * actor-only key (no tenant) under the actor boundary. The typed tenantId is
   * set from the same server-derived tenant used for tenantScope.
   */
  async reserve(input: ReserveIdempotencyInput): Promise<{
    outcome: 'reserved' | 'replay' | 'conflict' | 'in_progress';
    record: IdempotencyKey;
  }> {
    const { key, actorScope, tenantScope, method, route, fingerprint } = input;
    const now = new Date();
    return this.inScope(tenantScope, actorScope, async (tx) => {
      try {
        const record = await tx.idempotencyKey.create({
          data: {
            key,
            actorScope,
            tenantScope,
            tenantId: tenantScope,
            method,
            route,
            fingerprint,
            state: 'RESERVED',
            createdAt: now,
            updatedAt: now,
            expiresAt: input.expiresAt,
            requestId: input.requestId,
          },
        });
        this.metrics.recordIdempotencyOutcome('reserved');
        return { outcome: 'reserved', record };
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        const scoped = await this.findScoped(
          tx,
          key,
          actorScope,
          tenantScope,
          method,
          route,
        );
        if (!scoped || scoped.expiresAt <= now) {
          await this.purgeRecord(tx, scoped?.id).catch(() => undefined);
          throw error;
        }
        const outcome = this.classify(scoped, fingerprint, now);
        this.metrics.recordIdempotencyOutcome(outcome);
        if (outcome === 'conflict' || outcome === 'in_progress') {
          throw new IdempotencyConflictError(
            outcome === 'conflict'
              ? 'IDEMPOTENCY_CONFLICT'
              : 'IDEMPOTENCY_IN_PROGRESS',
          );
        }
        return { outcome: 'replay', record: scoped };
      }
    });
  }

  async complete(input: CompleteIdempotencyInput): Promise<IdempotencyKey> {
    return this.inScope(
      input.tenantId ?? null,
      input.actorScope ?? null,
      (tx) =>
        tx.idempotencyKey.update({
          where: { id: input.id },
          data: {
            state: 'COMPLETED',
            responseStatus: input.responseStatus,
            responseBody: JSON.parse(
              input.responseBody,
            ) as Prisma.InputJsonValue,
            responseHeaders: input.responseHeaders ?? undefined,
            attemptVersion: { increment: 1 },
            updatedAt: new Date(),
          },
        }),
    );
  }

  async markFailed(
    id: string,
    tenantId: string | null,
    actorScope: string | null,
  ): Promise<IdempotencyKey | null> {
    try {
      return await this.inScope(tenantId, actorScope, (tx) =>
        tx.idempotencyKey.update({
          where: { id },
          data: {
            state: 'FAILED',
            updatedAt: new Date(),
          },
        }),
      );
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async findScoped(
    tx: Prisma.TransactionClient | PrismaService,
    key: string,
    actorScope: string | null,
    tenantScope: string | null,
    method: string,
    route: string,
  ): Promise<IdempotencyKey | null> {
    return tx.idempotencyKey.findFirst({
      where: {
        key,
        actorScope: actorScope ?? null,
        tenantScope: tenantScope ?? null,
        method,
        route,
      },
    });
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return result.count;
  }

  async releaseReservation(
    id: string,
    tenantId: string | null,
    actorScope: string | null,
  ): Promise<IdempotencyKey | null> {
    try {
      return await this.inScope(tenantId, actorScope, (tx) =>
        tx.idempotencyKey.delete({ where: { id } }),
      );
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private inScope<T>(
    tenantId: string | null,
    actorScope: string | null,
    callback: (tx: Prisma.TransactionClient | PrismaService) => Promise<T>,
  ): Promise<T> {
    const operationId = randomUUID();
    if (tenantId) {
      return this.prisma.withWorkerTenantContext(
        tenantId,
        operationId,
        callback,
      );
    }
    if (actorScope) {
      return this.prisma.withActorScopeContext(
        actorScope,
        operationId,
        callback,
      );
    }
    return callback(this.prisma);
  }

  private purgeRecord(
    tx: Prisma.TransactionClient | PrismaService,
    id: string | undefined,
  ): Promise<unknown> {
    if (!id) return Promise.resolve();
    return tx.idempotencyKey.delete({ where: { id } }).catch(() => undefined);
  }

  private classify(
    record: IdempotencyKey,
    fingerprint: string,
    now: Date,
  ): 'replay' | 'conflict' | 'in_progress' {
    if (record.state === 'RESERVED') {
      return 'in_progress';
    }
    if (record.fingerprint !== fingerprint) {
      return 'conflict';
    }
    if (record.expiresAt <= now) {
      return 'conflict';
    }
    return 'replay';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

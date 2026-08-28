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

  async findById(id: string): Promise<IdempotencyKey | null> {
    return this.prisma.idempotencyKey.findUnique({ where: { id } });
  }

  /**
   * Atomically reserve an idempotency record for the given full scope.
   * The composite unique index enforces the scope; concurrent conflicting
   * requests converge on a single winner.
   */
  async reserve(input: ReserveIdempotencyInput): Promise<{
    outcome: 'reserved' | 'replay' | 'conflict' | 'in_progress';
    record: IdempotencyKey;
  }> {
    const { key, actorScope, tenantScope, method, route, fingerprint } = input;
    const now = new Date();
    try {
      const record = await this.prisma.idempotencyKey.create({
        data: {
          key,
          actorScope,
          tenantScope,
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
        key,
        actorScope,
        tenantScope,
        method,
        route,
      );
      if (!scoped || scoped.expiresAt <= now) {
        await this.purgeRecord(scoped?.id).catch(() => undefined);
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
  }

  async complete(input: CompleteIdempotencyInput): Promise<IdempotencyKey> {
    return this.prisma.idempotencyKey.update({
      where: { id: input.id },
      data: {
        state: 'COMPLETED',
        responseStatus: input.responseStatus,
        responseBody: JSON.parse(input.responseBody) as Prisma.InputJsonValue,
        responseHeaders: input.responseHeaders ?? undefined,
        attemptVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  async markFailed(id: string): Promise<IdempotencyKey | null> {
    try {
      return await this.prisma.idempotencyKey.update({
        where: { id },
        data: {
          state: 'FAILED',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async findScoped(
    key: string,
    actorScope: string | null,
    tenantScope: string | null,
    method: string,
    route: string,
  ): Promise<IdempotencyKey | null> {
    return this.prisma.idempotencyKey.findFirst({
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

  async releaseReservation(id: string): Promise<IdempotencyKey | null> {
    try {
      return await this.prisma.idempotencyKey.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private async purgeRecord(id: string | undefined): Promise<void> {
    if (!id) return;
    await this.prisma.idempotencyKey
      .delete({ where: { id } })
      .catch(() => undefined);
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

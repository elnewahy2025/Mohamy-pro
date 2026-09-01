import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IdempotencyConflictError } from '../../src/infrastructure/idempotency/idempotency-errors';

export type InMemoryIdempotencyState = 'RESERVED' | 'COMPLETED' | 'FAILED';

export interface InMemoryIdempotencyRecord {
  id: string;
  key: string;
  actorScope: string | null;
  tenantScope: string | null;
  method: string;
  route: string;
  fingerprint: string;
  state: InMemoryIdempotencyState;
  responseStatus: number | null;
  responseBody: unknown;
  expiresAt: Date;
}

export interface ReserveInput {
  key: string;
  actorScope: string | null;
  tenantScope: string | null;
  method: string;
  route: string;
  fingerprint: string;
  expiresAt: Date;
}

export interface CompleteInput {
  id: string;
  fingerprint: string;
  responseStatus: number;
  responseBody: string;
  tenantId: string | null;
  actorScope: string | null;
}

/**
 * Test-isolated in-memory idempotency store that mirrors the classification
 * semantics of the production IdempotencyService (reserved / replay / conflict
 * / in_progress). It exists ONLY to exercise the HTTP-layer contract through
 * the real IdempotencyInterceptor; the database-backed persistence semantics
 * are covered separately by `idempotency.service.spec.ts`.
 */
@Injectable()
export class InMemoryIdempotencyService {
  private readonly records = new Map<string, InMemoryIdempotencyRecord>();

  reserve(input: ReserveInput): Promise<{
    outcome: 'reserved' | 'replay' | 'conflict' | 'in_progress';
    record: InMemoryIdempotencyRecord;
  }> {
    const existing = this.records.get(input.key);
    if (!existing) {
      const record: InMemoryIdempotencyRecord = {
        id: randomUUID(),
        key: input.key,
        actorScope: input.actorScope,
        tenantScope: input.tenantScope,
        method: input.method,
        route: input.route,
        fingerprint: input.fingerprint,
        state: 'RESERVED',
        responseStatus: null,
        responseBody: undefined,
        expiresAt: input.expiresAt,
      };
      this.records.set(input.key, record);
      return Promise.resolve({ outcome: 'reserved', record });
    }
    const outcome = this.classify(existing, input.fingerprint);
    if (outcome === 'conflict' || outcome === 'in_progress') {
      return Promise.reject(
        new IdempotencyConflictError(
          outcome === 'conflict'
            ? 'IDEMPOTENCY_CONFLICT'
            : 'IDEMPOTENCY_IN_PROGRESS',
        ),
      );
    }
    return Promise.resolve({ outcome, record: existing });
  }

  complete(input: CompleteInput): Promise<InMemoryIdempotencyRecord> {
    const record = this.records.get(input.id) ?? this.findById(input.id);
    if (!record) {
      return Promise.reject(
        new Error(`Idempotency record not found: ${input.id}`),
      );
    }
    record.state = 'COMPLETED';
    record.responseStatus = input.responseStatus;
    record.responseBody = JSON.parse(input.responseBody) as unknown;
    return Promise.resolve(record);
  }

  markFailed(id: string): Promise<InMemoryIdempotencyRecord | null> {
    const record = this.records.get(id) ?? this.findById(id);
    if (!record) return Promise.resolve(null);
    record.state = 'FAILED';
    return Promise.resolve(record);
  }

  releaseReservation(id: string): Promise<InMemoryIdempotencyRecord | null> {
    const record = this.records.get(id) ?? this.findById(id);
    if (!record) return Promise.resolve(null);
    this.records.delete(record.key);
    return Promise.resolve(record);
  }

  private findById(id: string): InMemoryIdempotencyRecord | undefined {
    for (const record of this.records.values()) {
      if (record.id === id) return record;
    }
    return undefined;
  }

  /**
   * Test-only helper to rewind a stored reservation state so the in-progress
   * HTTP classification can be exercised without a slow concurrent rider.
   */
  setState(key: string, state: InMemoryIdempotencyState): void {
    for (const record of this.records.values()) {
      if (record.key === key) {
        record.state = state;
        return;
      }
    }
  }

  private classify(
    record: InMemoryIdempotencyRecord,
    fingerprint: string,
  ): 'replay' | 'conflict' | 'in_progress' {
    const now = new Date();
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

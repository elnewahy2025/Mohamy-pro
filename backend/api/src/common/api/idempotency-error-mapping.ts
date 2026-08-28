import { ApiError } from './api-error';
import { IdempotencyConflictError } from '../../infrastructure/idempotency/idempotency-errors';

export function normalizeIdempotencyError(error: unknown): unknown {
  if (error instanceof IdempotencyConflictError) {
    if (error.code === 'IDEMPOTENCY_IN_PROGRESS') {
      return ApiError.idempotencyInProgress();
    }
    return ApiError.idempotencyConflict();
  }
  return error;
}

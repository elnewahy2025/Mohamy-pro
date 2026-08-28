export class IdempotencyConflictError extends Error {
  constructor(
    public readonly code: 'IDEMPOTENCY_CONFLICT' | 'IDEMPOTENCY_IN_PROGRESS',
  ) {
    super(code);
    this.name = 'IdempotencyConflictError';
  }
}

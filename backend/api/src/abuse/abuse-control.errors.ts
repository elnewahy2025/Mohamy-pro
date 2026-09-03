import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Controlled abuse-control rejection. The public message is enumeration-safe:
 * it never reveals account existence, membership, invitation, or limit state.
 * The internal reason is carried separately for audit/server logging only.
 */
export class AbuseLimitReachedError extends HttpException {
  constructor(
    readonly reason: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      'Request is blocked temporarily. Please try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Fail-closed response used when the abuse limiter is unavailable. */
export class AbuseControlUnavailableError extends HttpException {
  constructor() {
    super(
      'Request protection is temporarily unavailable.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

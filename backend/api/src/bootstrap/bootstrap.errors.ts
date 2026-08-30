import { ApiError } from '../common/api/api-error';

/**
 * Non-enumerating denial for Platform bootstrap. All denial reasons (wrong
 * subject, missing/stale MFA, wrong secret, already bootstrapped, Platform
 * Admin already exists) surface the identical FORBIDDEN status, error code,
 * and message so an observer cannot tell which condition blocked the call.
 * The internal machine reason is retained only for server-side logging and
 * audit, never the HTTP response.
 */
export class BootstrapDeniedError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string) {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Platform bootstrap is not permitted.',
    });
    this.name = 'BootstrapDeniedError';
    this.internalReason = internalReason;
  }
}

/**
 * Fail-closed error raised when the operator attempts bootstrap without a
 * complete, valid environment bootstrap configuration.
 */
export class BootstrapNotConfiguredError extends ApiError {
  constructor() {
    super({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Platform bootstrap is not configured.',
    });
    this.name = 'BootstrapNotConfiguredError';
  }
}

import { ApiError } from '../../common/api/api-error';

/**
 * Controlled step-up-required denial for staff-sensitive operations. Missing,
 * stale, or non-MFA assurance all surface the identical 401/403 result so a
 * caller cannot infer which MFA condition blocked the operation. The internal
 * machine reason is retained only for server logs and audit.
 */
export class MfaStepUpRequiredError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string) {
    super({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Recent multi-factor authentication is required.',
    });
    this.name = 'MfaStepUpRequiredError';
    this.internalReason = internalReason;
  }
}

import { ApiError } from '../../common/api/api-error';

/**
 * Non-enumerating denial for tenant switching. All denial reasons (tenant not
 * found, no membership, suspended, window not active) surface the identical
 * FORBIDDEN status, error code, and message so an observer cannot distinguish
 * which tenant exists or a user's membership state. The internal machine reason
 * is retained only for server-side logging and audit, never the HTTP response.
 */
export class TenantSwitchDeniedError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string) {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Cannot switch tenant.',
    });
    this.name = 'TenantSwitchDeniedError';
    this.internalReason = internalReason;
  }
}

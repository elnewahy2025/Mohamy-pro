import { ApiError } from '../../common/api/api-error';

/**
 * Non-enumerating denial for invitation operations. All reasons (unavailable
 * invitation, wrong identity, expired, revoked, already consumed, or forbidden
 * actor) surface the identical error so an observer cannot distinguish which
 * condition applied or whether an account/tenant/invitation exists. The
 * internal machine reason is retained only for audit and logs.
 */
export class InvitationDeniedError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string, status = 403) {
    super({
      status,
      code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
      message:
        status === 401
          ? 'Recent multi-factor authentication is required.'
          : 'Invitation is not available.',
    });
    this.name = 'InvitationDeniedError';
    this.internalReason = internalReason;
  }
}

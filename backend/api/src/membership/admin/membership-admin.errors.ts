import { ApiError } from '../../common/api/api-error';

/**
 * Non-enumerating denial for membership administration. All reasons (unknown
 * membership, wrong tenant, forbidden actor, or invalid state transition)
 * surface the identical FORBIDDEN result so an observer cannot infer which
 * condition blocked the operation. The internal machine reason is retained
 * only for audit and logs.
 */
export class MembershipAdminDeniedError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string) {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Membership administration is not permitted.',
    });
    this.name = 'MembershipAdminDeniedError';
    this.internalReason = internalReason;
  }
}

import { ApiError } from '../common/api/api-error';

/**
 * Non-enumerating denial for conflict-check operations. The same FORBIDDEN
 * surface is returned regardless of whether the actor lacks
 * CanManageConflictChecks, the tenant context is missing, or the operation is
 * otherwise not permitted. The internal machine reason is retained only for
 * audit and logs.
 */
export class ConflictCheckAccessDeniedError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string) {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Conflict check operation is not permitted.',
    });
    this.name = 'ConflictCheckAccessDeniedError';
    this.internalReason = internalReason;
  }
}

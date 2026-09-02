import { ApiError } from '../common/api/api-error';

/**
 * Non-enumerating denial for organization configuration operations. The same
 * FORBIDDEN surface is returned regardless of whether the actor lacks the
 * permission, the tenant context is missing, or the operation is otherwise not
 * permitted. The internal machine reason is retained only for audit and logs.
 */
export class OrganizationConfigDeniedError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string) {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Organization configuration is not permitted.',
    });
    this.name = 'OrganizationConfigDeniedError';
    this.internalReason = internalReason;
  }
}

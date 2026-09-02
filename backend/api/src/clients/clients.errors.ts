import { ApiError } from '../common/api/api-error';

/**
 * Non-enumerating denial for client operations. The same FORBIDDEN surface is
 * returned regardless of whether the actor lacks CanManageClients, the tenant
 * context is missing, or the operation is otherwise not permitted. The internal
 * machine reason is retained only for audit and logs.
 */
export class ClientAccessDeniedError extends ApiError {
  readonly internalReason: string;

  constructor(internalReason: string) {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Client operation is not permitted.',
    });
    this.name = 'ClientAccessDeniedError';
    this.internalReason = internalReason;
  }
}

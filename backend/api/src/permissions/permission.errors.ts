import { ApiError } from '../common/api/api-error';

/**
 * Non-enumerating authorization denial. All denial reasons (missing requested
 * permission, tenant absent, membership inactive, or denied actor) surface the
 * identical FORBIDDEN status, code, and message so an observer cannot infer
 * whether a tenant, membership, role, or permission exists. The internal
 * machine reason is retained only for server-side logging and audit, never the
 * HTTP response.
 */
export class PermissionDeniedError extends ApiError {
  readonly internalReason: string;
  readonly permissionKey: string;

  constructor(permissionKey: string, internalReason: string) {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Not permitted to perform this operation.',
    });
    this.name = 'PermissionDeniedError';
    this.permissionKey = permissionKey;
    this.internalReason = internalReason;
  }
}

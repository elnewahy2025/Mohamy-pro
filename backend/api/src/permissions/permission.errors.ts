import { ApiError } from '../common/api/api-error';

/**
 * Non-enumerating authorization denial. All denial reasons (missing requested
 * permission, tenant absent, membership inactive, or denied actor) surface the
 * identical FORBIDDEN status, code, and message so an observer cannot infer
 * whether a tenant, membership, role, or permission exists. The internal
 * machine reason is retained only for server-side logging and audit, never the
 * HTTP response.
 */
/**
 * Non-enumerating resource denial for assignment-scoped access. Surfaced as
 * the identical 403 envelope as PermissionDeniedError so observers cannot
 * distinguish "no such resource" from "not assigned".
 */
export class ResourceAccessDeniedError extends ApiError {
  constructor() {
    super({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Access denied.',
    });
    this.name = 'ResourceAccessDeniedError';
  }
}

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

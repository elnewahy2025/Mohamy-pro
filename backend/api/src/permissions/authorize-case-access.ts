import type { Request } from 'express';
import { PermissionsService } from './permissions.service';
import { PERMISSION_KEYS, type PermissionKey } from './permission.constants';
import {
  PermissionDeniedError,
  ResourceAccessDeniedError,
} from './permission.errors';
import type { CaseAccessScope } from './resource-access.service';

export interface CaseAccessContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
  scope: CaseAccessScope;
}

/**
 * Shared FULL/ASSIGNED gate for every case-linked module. Holders of the
 * module manage-key get FULL scope with current behavior; otherwise holders
 * of CanAccessAssignedCases get ASSIGNED scope. Authentication failures
 * propagate; only permission denials fall through. Throws
 * ResourceAccessDeniedError (non-enumerating 403) when neither key is held.
 */
export async function authorizeCaseAccess(
  request: Request,
  permissions: PermissionsService,
  manageKey: PermissionKey,
): Promise<CaseAccessContext> {
  const auth = request.auth;
  if (!auth) throw new ResourceAccessDeniedError();
  if (!auth.activeTenantId) throw new ResourceAccessDeniedError();
  const base = {
    sessionId: auth.sessionId,
    userId: auth.userId,
    tenantId: auth.activeTenantId,
  };
  try {
    const { membershipId } = await permissions.assertTenantPermission({
      request,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      permissionKey: manageKey,
      operationId: auth.sessionId,
    });
    return { ...base, actorMembershipId: membershipId, scope: 'FULL' as const };
  } catch (error) {
    if (!(error instanceof PermissionDeniedError)) {
      throw error;
    }
  }
  try {
    const { membershipId } = await permissions.assertTenantPermission({
      request,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      permissionKey: PERMISSION_KEYS.CAN_ACCESS_ASSIGNED_CASES,
      operationId: auth.sessionId,
    });
    return {
      ...base,
      actorMembershipId: membershipId,
      scope: 'ASSIGNED' as const,
    };
  } catch {
    throw new ResourceAccessDeniedError();
  }
}

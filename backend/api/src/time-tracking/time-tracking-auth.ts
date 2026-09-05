import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionsService } from '../permissions/permissions.service';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../permissions/permission.constants';

export const TIME_APPROVE_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_APPROVE_TIME_ENTRIES;

export function requireTimeTrackingContext(request: Request): {
  tenantId: string;
  userId: string;
} {
  const auth = request.auth;
  if (!auth) throw new UnauthorizedException('UNAUTHENTICATED');
  if (!auth.activeTenantId)
    throw new BadRequestException('TENANT_CONTEXT_REQUIRED');
  return { tenantId: auth.activeTenantId, userId: auth.userId };
}

export async function requireTimeTrackingPermission(
  request: Request,
  permissions: PermissionsService,
  permissionKey: PermissionKey,
): Promise<{ tenantId: string; userId: string }> {
  const { tenantId, userId } = requireTimeTrackingContext(request);
  const auth = request.auth!;
  await permissions.assertTenantPermission({
    request,
    userId,
    tenantId,
    permissionKey,
    operationId: auth.sessionId,
  });
  return { tenantId, userId };
}

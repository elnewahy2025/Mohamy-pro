import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../permissions/permission.constants';
import { PortalAccessDeniedError } from './portal.errors';

export const PORTAL_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_ACCESS_PORTAL;

export interface PortalContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  actorMembershipId: string;
  clientId: string;
}

@Injectable()
export class PortalOperations {
  private readonly logger = new Logger(PortalOperations.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<PortalContext> {
    const auth = request.auth;
    if (!auth) throw new PortalAccessDeniedError('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new PortalAccessDeniedError('TENANT_CONTEXT_REQUIRED');
    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId: auth.userId,
        tenantId: auth.activeTenantId,
        permissionKey: PORTAL_PERMISSION,
        operationId: auth.sessionId,
      });
    const tenantId: string = auth.activeTenantId;
    const membership = await this.prisma.withMembershipSelectionContext(
      { userId: auth.userId, operationId: auth.sessionId },
      (transaction) =>
        transaction.membership.findFirst({
          where: { id: actorMembershipId, tenantId },
          select: { clientId: true },
        }),
    );
    if (!membership?.clientId) {
      throw new PortalAccessDeniedError('NO_LINKED_CLIENT');
    }
    return {
      sessionId: auth.sessionId,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      actorMembershipId,
      clientId: membership.clientId,
    };
  }

  async read<T>(
    request: Request,
    ctx: PortalContext,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.withTenantContext(
        {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          membershipId: ctx.actorMembershipId,
          operationId: ctx.sessionId,
        },
        operation,
      );
    } catch (error) {
      if (error instanceof PortalAccessDeniedError) throw error;
      this.logger.warn({
        message: 'Portal read failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

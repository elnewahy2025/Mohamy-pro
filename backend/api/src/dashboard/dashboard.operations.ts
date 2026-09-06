import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSION_KEYS } from '../permissions/permission.constants';
import {
  authorizeCaseAccess,
  type CaseAccessContext,
} from '../permissions/authorize-case-access';

@Injectable()
export class DashboardOperations {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async authorize(request: Request): Promise<CaseAccessContext> {
    return authorizeCaseAccess(
      request,
      this.permissions,
      PERMISSION_KEYS.CAN_MANAGE_CASES,
    );
  }

  async read<T>(
    request: Request,
    ctx: CaseAccessContext,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        membershipId: ctx.actorMembershipId,
        operationId: ctx.sessionId,
      },
      (transaction) => operation(transaction),
    );
  }
}

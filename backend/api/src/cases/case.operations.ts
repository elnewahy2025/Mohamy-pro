import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import type { Request } from 'express';
import { PERMISSION_KEYS } from '../permissions/permission.constants';
import { AppSessionContext } from '../auth/app-session.context';
import { CaseAccessDeniedError } from './case.errors';

@Injectable()
export class CaseOperations {
  constructor(private readonly prisma: PrismaService) {}

  public async authorize(req: Request) {
    const ctx = AppSessionContext.fromRequest(req);
    if (!ctx.activeTenantId) {
      throw new UnauthorizedException('Missing active tenant context');
    }
    const hasPerm = await ctx.hasPermission(PERMISSION_KEYS.CAN_MANAGE_CASES);
    if (!hasPerm) {
      throw new UnauthorizedException('Missing CanManageCases permission');
    }
    return ctx;
  }

  public async run<T>(
    req: Request,
    fn: (tx: Prisma.TransactionClient, ctx: AppSessionContext) => Promise<T>,
  ): Promise<T> {
    const ctx = await this.authorize(req);
    return this.prisma.withTenantContext(ctx.activeTenantId!, async (tx) => {
      return fn(tx, ctx);
    });
  }

  public async read<T>(
    req: Request,
    fn: (tx: Prisma.TransactionClient, ctx: AppSessionContext) => Promise<T>,
  ): Promise<T> {
    const ctx = await this.authorize(req);
    return this.prisma.withTenantContext(ctx.activeTenantId!, async (tx) => {
      return fn(tx, ctx);
    });
  }

  public async requireCaseInTenant(
    tx: Prisma.TransactionClient,
    ctx: AppSessionContext,
    caseId: string,
  ) {
    const c = await tx.case.findUnique({
      where: { id: caseId, tenantId: ctx.activeTenantId! },
    });
    if (!c) {
      throw new CaseAccessDeniedError();
    }
    return c;
  }
}

import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { DashboardOperations } from './dashboard.operations';
import { DashboardService } from './dashboard.service';

@Controller({
  path: 'dashboard',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class DashboardController {
  constructor(
    private readonly operations: DashboardOperations,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('summary')
  async summary(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.dashboard.getSummary(tx, ctx.tenantId, {
        scope: ctx.scope,
        membershipId: ctx.actorMembershipId,
        userId: ctx.userId,
      }),
    );
  }
}

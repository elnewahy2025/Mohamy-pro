import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { PortalOperations } from './portal.operations';
import { PortalService } from './portal.service';

@Controller({
  path: 'portal',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class PortalController {
  constructor(
    private readonly operations: PortalOperations,
    private readonly portal: PortalService,
  ) {}

  @Get('cases')
  async myCases(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.myCases(tx, ctx.tenantId, ctx.clientId),
    );
  }

  @Get('documents')
  async myDocuments(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.myDocuments(tx, ctx.tenantId, ctx.clientId),
    );
  }

  @Get('hearings')
  async myHearings(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.myHearings(tx, ctx.tenantId, ctx.clientId),
    );
  }

  @Get('deadlines')
  async myDeadlines(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.myDeadlines(tx, ctx.tenantId, ctx.clientId),
    );
  }

  @Get('messages')
  async myMessages(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.myMessages(tx, ctx.tenantId, ctx.clientId),
    );
  }

  @Get('invoices')
  async myInvoices(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.myInvoices(tx, ctx.tenantId, ctx.clientId),
    );
  }

  @Get('credits')
  async myCredits(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.myCredits(tx, ctx.tenantId, ctx.clientId),
    );
  }

  @Get('agenda')
  async agenda(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.portal.agenda(tx, ctx.tenantId, ctx.clientId),
    );
  }
}

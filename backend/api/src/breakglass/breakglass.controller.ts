import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { BreakGlassOperations } from './breakglass.operations';
import { ActivateBreakGlassDto } from './breakglass.dto';
import { BreakGlassService } from './breakglass.service';

@Controller({
  path: 'breakglass',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class BreakGlassController {
  constructor(
    private readonly operations: BreakGlassOperations,
    private readonly breakGlass: BreakGlassService,
  ) {}

  @Post()
  async activate(@Req() request: Request, @Body() dto: ActivateBreakGlassDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.BREAKGLASS_ACTIVATED,
      'BreakGlassActivation',
      (tx) =>
        this.breakGlass.activate(tx, ctx.tenantId, ctx.actorMembershipId, dto),
      { caseId: dto.caseId, subjectMembershipId: dto.subjectMembershipId },
    );
  }

  @Post(':id/revoke')
  async revoke(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.BREAKGLASS_REVOKED,
      'BreakGlassActivation',
      (tx) => this.breakGlass.revoke(tx, ctx.tenantId, id),
      { grantId: id },
    );
  }

  @Get()
  async listActive(@Req() request: Request, @Query('caseId') caseId?: string) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.breakGlass.listActive(tx, ctx.tenantId, caseId),
    );
  }
}

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { DeadlineOperations } from './deadline.operations';
import { DeadlineService } from './deadline.service';
import {
  CreateDeadlineRuleDto,
  CreateDeadlineDto,
  CompleteDeadlineDto,
} from './deadline.dto';

@Controller({
  path: 'deadlines',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class DeadlineController {
  constructor(
    private readonly operations: DeadlineOperations,
    private readonly deadlineService: DeadlineService,
  ) {}

  @Post('rules')
  async createRule(
    @Req() request: Request,
    @Body() dto: CreateDeadlineRuleDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DEADLINE_RULE_CREATED,
      'DeadlineRule',
      async (tx) => {
        return this.deadlineService.createRule(tx, ctx.tenantId, dto);
      },
      { name: dto.name },
    );
  }

  @Get('rules')
  async listRules(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, async (tx) => {
      return this.deadlineService.listRules(tx, ctx.tenantId);
    });
  }

  @Get()
  async listDeadlines(
    @Req() request: Request,
    @Query('caseId') caseId?: string,
  ) {
    const ctx = await this.operations.authorizeCaseAccess(request);
    return this.operations.read(request, ctx, async (tx) => {
      return this.deadlineService.listDeadlines(tx, ctx.tenantId, caseId, {
        scope: ctx.scope,
        membershipId: ctx.actorMembershipId,
      });
    });
  }

  @Post()
  async createDeadline(
    @Req() request: Request,
    @Body() dto: CreateDeadlineDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DEADLINE_CREATED,
      'Deadline',
      async (tx) => {
        return this.deadlineService.createDeadline(tx, ctx.tenantId, dto);
      },
      { caseId: dto.caseId, dueDate: dto.dueDate },
    );
  }

  @Post(':id/complete')
  async completeDeadline(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteDeadlineDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DEADLINE_COMPLETED,
      'Deadline',
      async (tx) => {
        return this.deadlineService.completeDeadline(tx, ctx.tenantId, id, dto);
      },
      { completionEvidence: dto.completionEvidence },
    );
  }
}

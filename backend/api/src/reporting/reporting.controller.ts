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
import { ReportingOperations } from './reporting.operations';
import { CreateDefinitionDto, CreateScheduleDto } from './reporting.dto';
import { DefinitionService } from './definition.service';
import { RunService } from './run.service';
import { ScheduleService } from './schedule.service';

@Controller({
  path: 'reports',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class ReportingController {
  constructor(
    private readonly operations: ReportingOperations,
    private readonly definitions: DefinitionService,
    private readonly runs: RunService,
    private readonly schedules: ScheduleService,
  ) {}

  @Post('definitions')
  async createDefinition(
    @Req() request: Request,
    @Body() dto: CreateDefinitionDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.REPORT_CREATED,
      'ReportDefinition',
      (tx) => this.definitions.create(tx, ctx.tenantId, ctx.userId, dto),
      { dataSource: dto.dataSource },
    );
  }

  @Get('definitions')
  async listDefinitions(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.definitions.list(tx, ctx.tenantId),
    );
  }

  @Post('definitions/:id/run')
  async runDefinition(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format?: string,
  ) {
    const ctx = await this.operations.authorizeCaseAccess(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.REPORT_RUN_COMPLETED,
      'ReportDefinition',
      (tx) =>
        this.runs.execute(tx, ctx.tenantId, id, {
          scope: ctx.scope,
          membershipId: ctx.actorMembershipId,
        }),
      { format: format ?? 'json' },
    );
  }

  @Post('schedules')
  async createSchedule(
    @Req() request: Request,
    @Body() dto: CreateScheduleDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.REPORT_CREATED,
      'ReportSchedule',
      (tx) => this.schedules.create(tx, ctx.tenantId, ctx.userId, dto),
      {},
    );
  }

  @Get('schedules')
  async listSchedules(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.schedules.list(tx, ctx.tenantId),
    );
  }

  @Get('runs')
  async listRuns(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      tx.reportRun.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }
}

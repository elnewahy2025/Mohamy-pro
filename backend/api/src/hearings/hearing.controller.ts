import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { HearingOperations } from './hearing.operations';
import { HearingService } from './hearing.service';
import { CreateHearingDto, UpdateHearingOutcomeDto } from './hearing.dto';

@Controller({
  path: 'hearings',
  version: '1',
})
@UseGuards(SessionGuard)
export class HearingController {
  constructor(
    private readonly operations: HearingOperations,
    private readonly hearingService: HearingService,
  ) {}

  @Get()
  async listHearings(
    @Req() request: Request,
    @Query('caseId') caseId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, async (tx) => {
      return this.hearingService.listHearings(tx, ctx.tenantId, caseId);
    });
  }

  @Post()
  async createHearing(@Req() request: Request, @Body() dto: CreateHearingDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.HEARING_CREATED,
      'Hearing',
      async (tx) => {
        return this.hearingService.createHearing(tx, ctx.tenantId, dto);
      },
      { caseId: dto.caseId, date: dto.date },
    );
  }

  @Post(':id/outcome')
  async recordOutcome(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHearingOutcomeDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.HEARING_OUTCOME_RECORDED,
      'Hearing',
      async (tx) => {
        return this.hearingService.recordOutcome(tx, ctx.tenantId, id, dto);
      },
      { outcome: dto.outcome, status: dto.status },
    );
  }

  @Delete(':id')
  async deleteHearing(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.HEARING_DELETED,
      'Hearing',
      async (tx) => {
        return this.hearingService.deleteHearing(tx, ctx.tenantId, id);
      },
      { hearingId: id },
    );
  }
}

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
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { CaseTimelineOperations } from './case-timeline.operations';
import { CaseTimelineService } from './case-timeline.service';
import {
  CaseTimelineQueryDto,
  CreateCaseTimelineEventDto,
} from './case-timeline.dto';

@Controller({
  path: 'cases/:caseId/timeline',
  version: '1',
})
@UseGuards(SessionGuard)
export class CaseTimelineController {
  constructor(
    private readonly operations: CaseTimelineOperations,
    private readonly caseTimelineService: CaseTimelineService,
  ) {}

  @Get()
  async listTimeline(
    @Req() request: Request,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Query() query: CaseTimelineQueryDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, async (tx) => {
      return this.caseTimelineService.listTimeline(
        tx,
        ctx.tenantId,
        caseId,
        query,
      );
    });
  }

  @Post()
  async appendTimelineEvent(
    @Req() request: Request,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateCaseTimelineEventDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.TIMELINE_EVENT_RECORDED,
      'CaseTimelineEvent',
      async (tx) => {
        return this.caseTimelineService.recordEvent(
          tx,
          ctx.tenantId,
          ctx.userId,
          ctx.actorMembershipId,
          {
            caseId,
            eventType: dto.eventType,
            payload: dto.payload,
          },
        );
      },
      { caseId, eventType: dto.eventType },
    );
  }
}

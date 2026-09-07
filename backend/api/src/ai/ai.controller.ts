import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { AiOperations } from './ai.operations';
import {
  CreateAiRequestDto,
  RejectAiRequestDto,
  ReviewAiRequestDto,
} from './ai.dto';
import { AiRequestService } from './request.service';
import { AiReviewService } from './review.service';

@Controller({
  path: 'ai',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class AiController {
  constructor(
    private readonly operations: AiOperations,
    private readonly requests: AiRequestService,
    private readonly review: AiReviewService,
  ) {}

  @Post('requests')
  async createRequest(
    @Req() request: Request,
    @Body() dto: CreateAiRequestDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.AI_REQUESTED,
      'AiRequest',
      (tx) =>
        this.requests.create(
          tx,
          ctx.tenantId,
          ctx.userId,
          {
            scope: ctx.scope,
            membershipId: ctx.actorMembershipId,
          },
          dto,
        ),
      { taskType: dto.taskType },
    );
  }

  @Get('requests')
  async listRequests(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.requests.list(tx, ctx.tenantId, {
        scope: ctx.scope,
        membershipId: ctx.actorMembershipId,
      }),
    );
  }

  @Get('requests/:id')
  async getRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.requests.get(tx, ctx.tenantId, id, {
        scope: ctx.scope,
        membershipId: ctx.actorMembershipId,
      }),
    );
  }

  @Post('requests/:id/approve')
  async approveRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAiRequestDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.AI_APPROVED,
      'AiRequest',
      (tx) =>
        this.review.approve(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          id,
          dto.reviewNotes,
        ),
      {},
    );
  }

  @Post('requests/:id/reject')
  async rejectRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAiRequestDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.AI_REJECTED,
      'AiRequest',
      (tx) =>
        this.review.reject(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          id,
          dto.reason,
        ),
      {},
    );
  }
}

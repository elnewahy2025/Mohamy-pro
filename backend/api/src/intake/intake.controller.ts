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
import { IntakeOperations } from './intake.operations';
import {
  ApproveIntakeDto,
  CreateIntakeDto,
  RejectIntakeDto,
  ReviewIntakeDto,
} from './intake.dto';
import { IntakeService } from './intake.service';
import { ConversionService } from './conversion.service';

@Controller({
  path: 'intake',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class IntakeController {
  constructor(
    private readonly operations: IntakeOperations,
    private readonly intake: IntakeService,
    private readonly conversion: ConversionService,
  ) {}

  @Post('requests')
  async createRequest(@Req() request: Request, @Body() dto: CreateIntakeDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INTAKE_CREATED,
      'IntakeRequest',
      (tx) => this.intake.create(tx, ctx.tenantId, ctx.userId, dto),
      { clientType: dto.clientType },
    );
  }

  @Get('requests')
  async listRequests(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.intake.list(tx, ctx.tenantId),
    );
  }

  @Post('requests/:id/review')
  async reviewRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewIntakeDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INTAKE_REVIEWED,
      'IntakeRequest',
      (tx) =>
        this.intake.markInReview(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          id,
          dto.reviewNotes,
        ),
      {},
    );
  }

  @Post('requests/:id/approve')
  async approveRequest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveIntakeDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INTAKE_APPROVED,
      'IntakeRequest',
      (tx) =>
        this.conversion.approve(
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
    @Body() dto: RejectIntakeDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INTAKE_REJECTED,
      'IntakeRequest',
      (tx) =>
        this.conversion.reject(
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

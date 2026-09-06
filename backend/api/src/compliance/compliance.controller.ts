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
import { ComplianceOperations } from './compliance.operations';
import {
  AuditQueryDto,
  CreateHoldDto,
  CreateRetentionPolicyDto,
  ReleaseHoldDto,
} from './compliance.dto';
import { AuditQueryService } from './audit-query.service';
import { RetentionService } from './retention.service';
import { HoldService } from './hold.service';

@Controller({
  path: 'compliance',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class ComplianceController {
  constructor(
    private readonly operations: ComplianceOperations,
    private readonly queries: AuditQueryService,
    private readonly retention: RetentionService,
    private readonly holds: HoldService,
  ) {}

  @Get('audit-events')
  async searchAudit(@Req() request: Request, @Query() query: AuditQueryDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.queries.search(tx, ctx.tenantId, query),
    );
  }

  @Get('audit-events/export')
  async exportAudit(
    @Req() request: Request,
    @Query() query: AuditQueryDto,
  ): Promise<{ csv: string }> {
    const ctx = await this.operations.authorize(request);
    const csv = await this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.AUDIT_EXPORTED,
      'AuditEvent',
      (tx) => this.queries.exportCsv(tx, ctx.tenantId, query),
      {},
    );
    return { csv };
  }

  @Post('retention/policies')
  async setPolicy(
    @Req() request: Request,
    @Body() dto: CreateRetentionPolicyDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.RETENTION_POLICY_SET,
      'RetentionPolicy',
      (tx) => this.retention.setPolicy(tx, ctx.tenantId, ctx.userId, dto),
      { targetType: dto.targetType, retainYears: String(dto.retainYears) },
    );
  }

  @Get('retention/policies')
  async listPolicies(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.retention.list(tx, ctx.tenantId),
    );
  }

  @Get('retention/evaluate')
  async evaluate(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.retention.evaluate(tx, ctx.tenantId),
    );
  }

  @Post('holds')
  async createHold(@Req() request: Request, @Body() dto: CreateHoldDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.HOLD_CREATED,
      'LegalHold',
      (tx) => this.holds.create(tx, ctx.tenantId, ctx.userId, dto),
      {},
    );
  }

  @Get('holds')
  async listHolds(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.holds.list(tx, ctx.tenantId),
    );
  }

  @Post('holds/:id/release')
  async releaseHold(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseHoldDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.HOLD_RELEASED,
      'LegalHold',
      (tx) =>
        this.holds.release(
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

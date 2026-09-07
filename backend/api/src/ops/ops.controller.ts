import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { OpsOperations } from './ops.operations';
import { FinishDrillDto, SetBackupPolicyDto, StartDrillDto } from './ops.dto';
import { OpsStatusService } from './status.service';
import { BackupPolicyService } from './policy.service';
import { DrillService } from './drill.service';

@Controller({
  path: 'ops',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class OpsController {
  constructor(
    private readonly operations: OpsOperations,
    private readonly status: OpsStatusService,
    private readonly policies: BackupPolicyService,
    private readonly drills: DrillService,
  ) {}

  @Get('status')
  async getStatus(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.status.status(tx, ctx.tenantId),
    );
  }

  @Put('backup-policy')
  async setPolicy(@Req() request: Request, @Body() dto: SetBackupPolicyDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.BACKUP_POLICY_SET,
      'BackupPolicy',
      (tx) => this.policies.set(tx, ctx.tenantId, ctx.userId, dto),
      { rpoHours: String(dto.rpoHours), rtoHours: String(dto.rtoHours) },
    );
  }

  @Get('backup-policy')
  async getPolicy(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.policies.get(tx, ctx.tenantId),
    );
  }

  @Post('drills')
  async startDrill(@Req() request: Request, @Body() dto: StartDrillDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.RESTORE_DRILL_STARTED,
      'RestoreDrill',
      (tx) => this.drills.start(tx, ctx.tenantId, ctx.userId, dto),
      {},
    );
  }

  @Get('drills')
  async listDrills(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.drills.list(tx, ctx.tenantId),
    );
  }

  @Post('drills/:id/finish')
  async finishDrill(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinishDrillDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.RESTORE_DRILL_FINISHED,
      'RestoreDrill',
      (tx) =>
        this.drills.finish(tx, ctx.tenantId, ctx.actorMembershipId, id, dto),
      {},
    );
  }
}

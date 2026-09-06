import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { NotificationOperations } from './notification.operations';
import {
  CreateRuleDto,
  SetPreferenceDto,
  UpdateRuleDto,
} from './notification.dto';
import { RuleService } from './rule.service';
import { PreferenceService } from './preference.service';

@Controller({
  path: 'notifications',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class NotificationController {
  constructor(
    private readonly operations: NotificationOperations,
    private readonly rules: RuleService,
    private readonly preferences: PreferenceService,
  ) {}

  @Post('rules')
  async createRule(@Req() request: Request, @Body() dto: CreateRuleDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.NOTIFICATION_RULE_CREATED,
      'NotificationRule',
      (tx) => this.rules.create(tx, ctx.tenantId, dto),
      { eventType: dto.eventType },
    );
  }

  @Patch('rules/:id')
  async updateRule(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.NOTIFICATION_RULE_UPDATED,
      'NotificationRule',
      (tx) => this.rules.update(tx, ctx.tenantId, id, dto),
      {},
    );
  }

  @Get('rules')
  async listRules(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.rules.list(tx, ctx.tenantId),
    );
  }

  @Get('inbox')
  async inbox(@Req() request: Request) {
    const ctx = await this.operations.authorizeInbox(request);
    return this.operations.read(request, ctx, (tx) =>
      tx.notification.findMany({
        where: {
          tenantId: ctx.tenantId,
          membershipId: ctx.actorMembershipId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  @Post('inbox/:id/read')
  async markRead(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorizeInbox(request);
    return this.operations.read(request, ctx, (tx) =>
      tx.notification.updateMany({
        where: {
          id,
          tenantId: ctx.tenantId,
          membershipId: ctx.actorMembershipId,
        },
        data: { status: 'READ', readAt: new Date() },
      }),
    );
  }

  @Post('preferences')
  async setPreference(@Req() request: Request, @Body() dto: SetPreferenceDto) {
    const ctx = await this.operations.authorizeInbox(request);
    return this.operations.read(request, ctx, (tx) =>
      this.preferences.set(tx, ctx.tenantId, ctx.actorMembershipId, dto),
    );
  }

  @Get('preferences')
  async listPreferences(@Req() request: Request) {
    const ctx = await this.operations.authorizeInbox(request);
    return this.operations.read(request, ctx, (tx) =>
      this.preferences.listMine(tx, ctx.tenantId, ctx.actorMembershipId),
    );
  }
}

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
import { CalendarOperations } from './calendar.operations';
import {
  CreateConnectionDto,
  PullChangesDto,
  PushEventDto,
  ResolveConflictDto,
  WebhookReceiptDto,
} from './calendar.dto';
import { ConnectionService } from './connection.service';
import { SyncService } from './sync.service';

@Controller({
  path: 'calendar',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class CalendarController {
  constructor(
    private readonly operations: CalendarOperations,
    private readonly connections: ConnectionService,
    private readonly sync: SyncService,
  ) {}

  @Post('connections')
  async createConnection(
    @Req() request: Request,
    @Body() dto: CreateConnectionDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CALENDAR_CONNECTED,
      'CalendarConnection',
      (tx) => this.connections.create(tx, ctx.tenantId, dto),
      { provider: dto.provider },
    );
  }

  @Get('connections')
  async listConnections(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.connections.list(tx, ctx.tenantId),
    );
  }

  @Post('connections/:id/enable')
  async enableConnection(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CALENDAR_CONNECTED,
      'CalendarConnection',
      (tx) => this.connections.setEnabled(tx, ctx.tenantId, id, true),
      {},
    );
  }

  @Post('connections/:id/disable')
  async disableConnection(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CALENDAR_DISABLED,
      'CalendarConnection',
      (tx) => this.connections.setEnabled(tx, ctx.tenantId, id, false),
      {},
    );
  }

  @Post('sync/push')
  async pushEvent(@Req() request: Request, @Body() dto: PushEventDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CALENDAR_SYNCED,
      'CalendarEventMapping',
      (tx) => this.sync.push(tx, ctx.tenantId, dto),
      { connectionId: dto.connectionId },
    );
  }

  @Post('sync/pull')
  async pullChanges(@Req() request: Request, @Body() dto: PullChangesDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CALENDAR_SYNCED,
      'CalendarSyncCursor',
      (tx) => this.sync.pull(tx, ctx.tenantId, dto),
      { connectionId: dto.connectionId },
    );
  }

  @Get('mappings')
  async listMappings(
    @Req() request: Request,
    @Query('connectionId') connectionId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.sync.listMappings(tx, ctx.tenantId, connectionId ?? ''),
    );
  }

  @Post('webhooks/:connectionId')
  async receiveWebhook(
    @Req() request: Request,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: WebhookReceiptDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CALENDAR_CONFLICT_RECORDED,
      'CalendarSyncConflict',
      (tx) => this.sync.recordWebhook(tx, ctx.tenantId, connectionId, dto),
      { reason: dto.reason },
    );
  }

  @Get('conflicts')
  async listConflicts(
    @Req() request: Request,
    @Query('connectionId') connectionId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.sync.listConflicts(tx, ctx.tenantId, connectionId ?? ''),
    );
  }

  @Post('conflicts/:id/resolve')
  async resolveConflict(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveConflictDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CALENDAR_CONFLICT_RECORDED,
      'CalendarSyncConflict',
      (tx) => this.sync.resolveConflict(tx, ctx.tenantId, id, dto),
      {},
    );
  }

  @Get('agenda')
  async readAgenda(
    @Req() request: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) => {
      const now = new Date();
      const start = from ? new Date(from) : now;
      const end = to
        ? new Date(to)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return this.sync.agenda(tx, ctx.tenantId, start, end);
    });
  }
}

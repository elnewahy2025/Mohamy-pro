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
import { CommunicationsOperations } from './communications.operations';
import {
  AddAttachmentDto,
  CreateMessageDto,
  CreateThreadDto,
  RecordMessageStatusDto,
  SetConsentDto,
} from './communications.dto';
import { ThreadService } from './thread.service';
import { MessageService } from './message.service';
import { ConsentService } from './consent.service';
import { DeliveryService } from './delivery.service';

@Controller({
  path: 'communications',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class CommunicationsController {
  constructor(
    private readonly operations: CommunicationsOperations,
    private readonly threads: ThreadService,
    private readonly messages: MessageService,
    private readonly consents: ConsentService,
    private readonly delivery: DeliveryService,
  ) {}

  @Post('threads')
  async createThread(@Req() request: Request, @Body() dto: CreateThreadDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.MESSAGE_QUEUED,
      'MessageThread',
      (tx) => this.threads.create(tx, ctx.tenantId, dto),
      { caseId: dto.caseId },
    );
  }

  @Get('threads')
  async listThreads(
    @Req() request: Request,
    @Query('caseId') caseId?: string,
    @Query('clientId') clientId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.threads.list(tx, ctx.tenantId, { caseId, clientId }),
    );
  }

  @Post('threads/:id/close')
  async closeThread(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.MESSAGE_STATUS_RECORDED,
      'MessageThread',
      (tx) => this.threads.close(tx, ctx.tenantId, id),
      {},
    );
  }

  @Post('messages')
  async composeMessage(@Req() request: Request, @Body() dto: CreateMessageDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.MESSAGE_QUEUED,
      'Message',
      (tx) =>
        this.messages.compose(
          tx,
          ctx.tenantId,
          ctx.userId,
          ctx.actorMembershipId,
          dto,
        ),
      { channel: dto.channel, direction: dto.direction },
    );
  }

  @Get('messages')
  async listMessages(
    @Req() request: Request,
    @Query('threadId') threadId?: string,
    @Query('caseId') caseId?: string,
    @Query('clientId') clientId?: string,
    @Query('channel') channel?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.messages.list(tx, ctx.tenantId, {
        threadId,
        caseId,
        clientId,
        channel,
      }),
    );
  }

  @Post('messages/:id/status')
  async recordStatus(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordMessageStatusDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.MESSAGE_STATUS_RECORDED,
      'Message',
      (tx) => this.delivery.recordStatus(tx, ctx.tenantId, id, dto),
      { status: dto.status },
    );
  }

  @Post('messages/:id/attachments')
  async addAttachment(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAttachmentDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.MESSAGE_QUEUED,
      'MessageAttachment',
      (tx) => this.delivery.addAttachment(tx, ctx.tenantId, id, dto),
      {},
    );
  }

  @Get('messages/:id/attachments')
  async listAttachments(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.delivery.listAttachments(tx, ctx.tenantId, id),
    );
  }

  @Post('consents')
  async setConsent(@Req() request: Request, @Body() dto: SetConsentDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.MESSAGE_STATUS_RECORDED,
      'MessageConsent',
      (tx) => this.consents.set(tx, ctx.tenantId, dto),
      { channel: dto.channel },
    );
  }

  @Get('consents')
  async listConsents(
    @Req() request: Request,
    @Query('clientId') clientId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.consents.listByClient(tx, ctx.tenantId, clientId ?? ''),
    );
  }
}

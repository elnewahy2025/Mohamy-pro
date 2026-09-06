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
import { IntegrationsOperations } from './integrations.operations';
import {
  IntegrationKeyParam,
  RegisterWebhookDto,
  SetIntegrationDto,
  WEBHOOK_EVENTS,
} from './integrations.dto';
import { RegistryService } from './registry.service';
import { WebhookService } from './webhook.service';

@Controller({
  path: 'integrations',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class IntegrationsController {
  constructor(
    private readonly operations: IntegrationsOperations,
    private readonly registry: RegistryService,
    private readonly webhooks: WebhookService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.registry.list(tx, ctx.tenantId),
    );
  }

  @Get('health')
  async health(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.registry.health(tx, ctx.tenantId),
    );
  }

  @Get('events')
  async events(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, async () => [...WEBHOOK_EVENTS]);
  }

  @Put(':key')
  async set(
    @Req() request: Request,
    @Param() params: IntegrationKeyParam,
    @Body() dto: SetIntegrationDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.INTEGRATION_CONFIGURED,
      'Integration',
      (tx) => this.registry.set(tx, ctx.tenantId, ctx.userId, params.key, dto),
      { key: params.key },
    );
  }

  @Post('webhooks')
  async registerWebhook(
    @Req() request: Request,
    @Body() dto: RegisterWebhookDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.WEBHOOK_REGISTERED,
      'WebhookEndpoint',
      (tx) => this.webhooks.register(tx, ctx.tenantId, ctx.userId, dto),
      {},
    );
  }

  @Get('webhooks')
  async listWebhooks(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.webhooks.list(tx, ctx.tenantId),
    );
  }

  @Post('webhooks/:id/rotate')
  async rotateWebhook(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.WEBHOOK_ROTATED,
      'WebhookEndpoint',
      (tx) => this.webhooks.rotate(tx, ctx.tenantId, id),
      {},
    );
  }

  @Post('webhooks/:id/disable')
  async disableWebhook(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.WEBHOOK_DISABLED,
      'WebhookEndpoint',
      (tx) => this.webhooks.disable(tx, ctx.tenantId, id),
      {},
    );
  }
}

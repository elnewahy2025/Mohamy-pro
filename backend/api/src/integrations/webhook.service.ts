import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashToken } from '../auth/session/session-crypto';
import {
  IntegrationsInvalidStateError,
  IntegrationsNotFoundError,
} from './integrations.errors';
import { WEBHOOK_EVENTS, type RegisterWebhookDto } from './integrations.dto';

export interface WebhookWithSecret {
  endpoint: Record<string, unknown>;
  secret: string;
}

@Injectable()
export class WebhookService {
  private validate(dto: RegisterWebhookDto): void {
    let parsed: URL;
    try {
      parsed = new URL(dto.url);
    } catch {
      throw new IntegrationsInvalidStateError('Webhook URL is not parseable');
    }
    const isLocal =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocal) {
      throw new IntegrationsInvalidStateError(
        'Webhook URL must use https (http is allowed for localhost only)',
      );
    }
    if (
      !Array.isArray(dto.events) ||
      dto.events.length < 1 ||
      dto.events.length > 10
    ) {
      throw new IntegrationsInvalidStateError(
        'Subscribe to between 1 and 10 events',
      );
    }
    for (const event of dto.events) {
      if (!WEBHOOK_EVENTS.includes(event as never)) {
        throw new IntegrationsInvalidStateError(
          `Unknown webhook event: ${event}`,
        );
      }
    }
  }

  private redact(endpoint: Record<string, unknown>): Record<string, unknown> {
    const { secretHash: _dropped, ...rest } = endpoint;
    return { ...rest, hasSecret: true };
  }

  async register(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: RegisterWebhookDto,
  ): Promise<WebhookWithSecret> {
    this.validate(dto);
    const secret = randomBytes(32).toString('base64url');
    const endpoint = await tx.webhookEndpoint.create({
      data: {
        tenantId,
        url: dto.url,
        events: dto.events,
        secretHash: hashToken(secret),
        createdBy: userId,
      },
    });
    return {
      endpoint: this.redact(endpoint as Record<string, unknown>),
      secret,
    };
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    const endpoints = await tx.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return endpoints.map((endpoint) =>
      this.redact(endpoint as Record<string, unknown>),
    );
  }

  async rotate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<WebhookWithSecret> {
    const endpoint = await tx.webhookEndpoint.findFirst({
      where: { id, tenantId },
    });
    if (!endpoint) throw new IntegrationsNotFoundError('Webhook not found');
    if (endpoint.status !== 'ENABLED') {
      throw new IntegrationsInvalidStateError(
        'Only enabled webhooks can rotate secrets',
      );
    }
    const secret = randomBytes(32).toString('base64url');
    const updated = await tx.webhookEndpoint.update({
      where: { id_tenantId: { id: endpoint.id, tenantId } },
      data: { secretHash: hashToken(secret) },
    });
    return {
      endpoint: this.redact(updated as Record<string, unknown>),
      secret,
    };
  }

  async disable(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const endpoint = await tx.webhookEndpoint.findFirst({
      where: { id, tenantId },
    });
    if (!endpoint) throw new IntegrationsNotFoundError('Webhook not found');
    if (endpoint.status !== 'ENABLED') {
      throw new IntegrationsInvalidStateError(
        'Only enabled webhooks can be disabled',
      );
    }
    return this.redact(
      (await tx.webhookEndpoint.update({
        where: { id_tenantId: { id: endpoint.id, tenantId } },
        data: { status: 'DISABLED' },
      })) as Record<string, unknown>,
    );
  }
}

import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  HttpStatus,
  Req,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { ValidatedEnvironment } from '../config/env.validation';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  QueueService,
  APPLICATION_QUEUE_NAME,
} from '../infrastructure/queue/queue.service';
import { MetricsService } from './metrics.service';

@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(
    private readonly config: ConfigService<ValidatedEnvironment, true>,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  async getMetrics(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!this.metrics.enabled) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
      });
      return;
    }

    if (!this.isAuthorized(request)) {
      response.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
      });
      return;
    }

    const [queueCounts, outboxCounts] = await Promise.all([
      this.queue.getCounts(),
      this.prisma.outboxMessage.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    this.metrics.setQueueDepth(APPLICATION_QUEUE_NAME, queueCounts);
    this.metrics.setOutboxStateCounts(
      Object.fromEntries(
        outboxCounts.map((item) => [item.status, item._count._all]),
      ),
    );

    response.setHeader('Content-Type', this.metrics.registry.contentType);
    response.status(HttpStatus.OK).send(await this.metrics.render());
  }

  private isAuthorized(request: Request): boolean {
    const configuredToken = this.config.get<string>('METRICS_AUTH_TOKEN');
    if (configuredToken) {
      const suppliedToken = this.readSuppliedToken(request);
      if (!suppliedToken) return false;
      const expected = Buffer.from(configuredToken, 'utf8');
      const supplied = Buffer.from(suppliedToken, 'utf8');
      return (
        expected.length === supplied.length &&
        timingSafeEqual(expected, supplied)
      );
    }

    if (this.config.get<string>('NODE_ENV') === 'production') return false;
    return isLoopback(request.ip);
  }

  private readSuppliedToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      return authorization.slice('Bearer '.length).trim();
    }
    const header = request.headers['x-metrics-token'];
    return typeof header === 'string' ? header.trim() : undefined;
  }
}

function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

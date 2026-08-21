import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { ValidatedEnvironment } from '../config/env.validation';

export interface MetricsRequestLike {
  headers: IncomingHttpHeaders;
  ip?: string;
  socket?: { remoteAddress?: string | null };
}

export function isMetricsAuthorized(
  config: ConfigService<ValidatedEnvironment, true>,
  request: MetricsRequestLike | Request,
): boolean {
  const configuredToken = config.get<string>('METRICS_AUTH_TOKEN');
  if (configuredToken) {
    const suppliedToken = readSuppliedToken(request.headers);
    if (!suppliedToken) return false;
    const expected = Buffer.from(configuredToken, 'utf8');
    const supplied = Buffer.from(suppliedToken, 'utf8');
    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  }

  if (config.get<string>('NODE_ENV') === 'production') return false;
  return isLoopback(request.ip ?? request.socket?.remoteAddress ?? undefined);
}

function readSuppliedToken(headers: IncomingHttpHeaders): string | undefined {
  const authorization = headers.authorization;
  if (
    typeof authorization === 'string' &&
    authorization.startsWith('Bearer ')
  ) {
    return authorization.slice('Bearer '.length).trim();
  }
  const header = headers['x-metrics-token'];
  return typeof header === 'string' ? header.trim() : undefined;
}

function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

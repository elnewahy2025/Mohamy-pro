import type { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';
import { isMetricsAuthorized } from './metrics-access';

function config(
  values: Record<string, unknown>,
): ConfigService<ValidatedEnvironment, true> {
  return {
    get: <T>(key: string, fallback?: T) =>
      (values[key] as T | undefined) ?? fallback,
  } as ConfigService<ValidatedEnvironment, true>;
}

describe('metrics authorization', () => {
  it('allows loopback access in development without a token', () => {
    expect(
      isMetricsAuthorized(config({ NODE_ENV: 'development' }), {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      }),
    ).toBe(true);
    expect(
      isMetricsAuthorized(config({ NODE_ENV: 'development' }), {
        headers: {},
        socket: { remoteAddress: '10.0.0.20' },
      }),
    ).toBe(false);
  });

  it('requires a constant-time token in production', () => {
    const production = config({
      NODE_ENV: 'production',
      METRICS_AUTH_TOKEN: 'test-token',
    });

    expect(
      isMetricsAuthorized(production, {
        headers: { authorization: 'Bearer test-token' },
        socket: { remoteAddress: '10.0.0.20' },
      }),
    ).toBe(true);
    expect(
      isMetricsAuthorized(production, {
        headers: { 'x-metrics-token': 'wrong-token' },
        socket: { remoteAddress: '10.0.0.20' },
      }),
    ).toBe(false);
  });
});

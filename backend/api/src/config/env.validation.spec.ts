import { validateEnvironment } from './env.validation';

const baseEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://database.invalid/mohamy',
};

describe('validateEnvironment telemetry settings', () => {
  it('defaults metrics on and OpenTelemetry off when no endpoint is configured', () => {
    const environment = validateEnvironment(baseEnvironment);

    expect(environment.METRICS_ENABLED).toBe(true);
    expect(environment.OTEL_ENABLED).toBe(false);
    expect(environment.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(environment.OTEL_SERVICE_NAME).toBe('mohamy-api');
  });

  it('enables OpenTelemetry when an OTLP endpoint is supplied', () => {
    const environment = validateEnvironment({
      ...baseEnvironment,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector.invalid:4318',
      OTEL_SERVICE_NAME: 'mohamy-test-api',
    });

    expect(environment.OTEL_ENABLED).toBe(true);
    expect(environment.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(
      'http://collector.invalid:4318',
    );
    expect(environment.OTEL_SERVICE_NAME).toBe('mohamy-test-api');
  });

  it('rejects malformed telemetry booleans', () => {
    expect(() =>
      validateEnvironment({ ...baseEnvironment, METRICS_ENABLED: 'sometimes' }),
    ).toThrow('Expected a boolean value');
  });
});

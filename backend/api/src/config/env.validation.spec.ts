import { validateEnvironment } from './env.validation';

const baseEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://database.invalid/mohamy',
};

describe('validateEnvironment telemetry settings', () => {
  it('defaults metrics on and OpenTelemetry off when no endpoint is configured', () => {
    const environment = validateEnvironment(baseEnvironment);

    expect(environment.METRICS_ENABLED).toBe(true);
    expect(environment.WORKER_METRICS_PORT).toBe(3002);
    expect(environment.RATE_LIMIT_ENABLED).toBe(true);
    expect(environment.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(environment.RATE_LIMIT_MAX_REQUESTS).toBe(300);
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

  it('rejects malformed rate-limit settings', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        RATE_LIMIT_WINDOW_SECONDS: 0,
      }),
    ).toThrow('RATE_LIMIT_WINDOW_SECONDS must be an integer');
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        RATE_LIMIT_MAX_REQUESTS: 'many',
      }),
    ).toThrow('RATE_LIMIT_MAX_REQUESTS must be an integer');
  });

  it('rejects malformed telemetry booleans', () => {
    expect(() =>
      validateEnvironment({ ...baseEnvironment, METRICS_ENABLED: 'sometimes' }),
    ).toThrow('Expected a boolean value');
  });

  it('leaves bootstrap unset when no BOOTSTRAP_* variables are present', () => {
    const environment = validateEnvironment(baseEnvironment);
    expect(environment.BOOTSTRAP_SUBJECT).toBeUndefined();
    expect(environment.BOOTSTRAP_SECRET).toBeUndefined();
    expect(environment.BOOTSTRAP_MFA_MAX_AGE_SECONDS).toBe(900);
  });

  it('parses a complete bootstrap configuration', () => {
    const environment = validateEnvironment({
      ...baseEnvironment,
      BOOTSTRAP_SUBJECT: 'sub-bootstrapper',
      BOOTSTRAP_SECRET: 'one-time-bootstrap-secret-123',
      BOOTSTRAP_TENANT_SLUG: 'acme',
      BOOTSTRAP_TENANT_NAME: 'Acme Corp',
      BOOTSTRAP_ORG_SLUG: 'acme-inc',
      BOOTSTRAP_ORG_NAME: 'Acme Incorporated',
      BOOTSTRAP_MFA_MAX_AGE_SECONDS: 600,
    });

    expect(environment.BOOTSTRAP_SUBJECT).toBe('sub-bootstrapper');
    expect(environment.BOOTSTRAP_SECRET).toBe('one-time-bootstrap-secret-123');
    expect(environment.BOOTSTRAP_TENANT_NAME).toBe('Acme Corp');
    expect(environment.BOOTSTRAP_MFA_MAX_AGE_SECONDS).toBe(600);
  });

  it('rejects a partial bootstrap configuration', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        BOOTSTRAP_SUBJECT: 'sub-bootstrapper',
        BOOTSTRAP_SECRET: 'one-time-bootstrap-secret-123',
      }),
    ).toThrow('must all be set together to enable Platform bootstrap');
  });

  it('rejects a bootstrap secret that is too short', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        BOOTSTRAP_SUBJECT: 'sub-bootstrapper',
        BOOTSTRAP_SECRET: 'short',
      }),
    ).toThrow('BOOTSTRAP_SECRET must be at least 16 characters');
  });

  it('requires rate limiting in production', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        RATE_LIMIT_ENABLED: false,
        REDIS_URL: 'redis://redis.invalid:6379',
        S3_ENDPOINT: 'https://storage.invalid',
        S3_ACCESS_KEY: 'access-key-for-test',
        S3_SECRET_KEY: 'secret-key-for-test',
        S3_BUCKET: 'mohamy-production',
        CORS_ORIGINS: 'https://app.invalid',
        S3_VERSIONING_ENABLED: true,
        S3_OBJECT_LOCK_ENABLED: true,
        S3_ENCRYPTION_MODE: 'AES256',
        MALWARE_SCAN_ENABLED: true,
        CLAMAV_HOST: 'clamav.invalid',
      }),
    ).toThrow('RATE_LIMIT_ENABLED must be true in production');
  });

  it('requires storage security controls in production', () => {
    const environment = validateEnvironment({
      ...baseEnvironment,
      NODE_ENV: 'production',
      REDIS_URL: 'redis://redis.invalid:6379',
      S3_ENDPOINT: 'https://storage.invalid',
      S3_ACCESS_KEY: 'access-key-for-test',
      S3_SECRET_KEY: 'secret-key-for-test',
      S3_BUCKET: 'mohamy-production',
      CORS_ORIGINS: 'https://app.invalid',
      S3_VERSIONING_ENABLED: true,
      S3_OBJECT_LOCK_ENABLED: true,
      S3_ENCRYPTION_MODE: 'AES256',
      MALWARE_SCAN_ENABLED: true,
      CLAMAV_HOST: 'clamav.invalid',
      OIDC_ISSUER: 'https://issuer.invalid/oidc',
      OIDC_CLIENT_ID: 'client-id',
      OIDC_CLIENT_SECRET: 'client-secret',
      OIDC_REDIRECT_URI: 'https://app.invalid/callback',
      SESSION_SECRET: 'production-session-secret-that-is-long-enough-000000',
      SESSION_SECURE_COOKIE: true,
      OIDC_SCOPE: 'openid profile',
    });

    expect(environment.S3_VERSIONING_ENABLED).toBe(true);
    expect(environment.S3_OBJECT_LOCK_ENABLED).toBe(true);
    expect(environment.S3_ENCRYPTION_MODE).toBe('AES256');
    expect(environment.MALWARE_SCAN_ENABLED).toBe(true);
    expect(environment.OIDC_ISSUER).toBe('https://issuer.invalid/oidc');
    expect(environment.SESSION_SECURE_COOKIE).toBe(true);
  });

  it('rejects production storage without malware scanning', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        REDIS_URL: 'redis://redis.invalid:6379',
        S3_ENDPOINT: 'https://storage.invalid',
        S3_ACCESS_KEY: 'access-key-for-test',
        S3_SECRET_KEY: 'secret-key-for-test',
        S3_BUCKET: 'mohamy-production',
        CORS_ORIGINS: 'https://app.invalid',
        S3_VERSIONING_ENABLED: true,
        S3_OBJECT_LOCK_ENABLED: true,
        S3_ENCRYPTION_MODE: 'AES256',
        MALWARE_SCAN_ENABLED: false,
      }),
    ).toThrow('MALWARE_SCAN_ENABLED must be true in production');
  });
});

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
      OIDC_ISSUER_URL: 'https://issuer.invalid/realms/mohamy',
      OIDC_CLIENT_ID: 'mohamy-api',
      OIDC_CLIENT_SECRET: 'client-secret-for-test',
      OIDC_AUDIENCE: 'mohamy-api',
      OIDC_REDIRECT_URI: 'https://api.invalid/api/v1/auth/callback',
      OIDC_POST_LOGOUT_REDIRECT_URI: 'https://app.invalid/en',
      OIDC_SCOPES: 'openid profile email',
      SESSION_COOKIE_NAME: 'mohamy_session',
      SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
      SESSION_IDLE_TTL_SECONDS: 1800,
      SESSION_ABSOLUTE_TTL_SECONDS: 43200,
      SESSION_SECURE_COOKIE: true,
    });

    expect(environment.S3_VERSIONING_ENABLED).toBe(true);
    expect(environment.S3_OBJECT_LOCK_ENABLED).toBe(true);
    expect(environment.S3_ENCRYPTION_MODE).toBe('AES256');
    expect(environment.MALWARE_SCAN_ENABLED).toBe(true);
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

describe('validateEnvironment authentication settings', () => {
  const productionEnvironment = {
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
    OIDC_ISSUER_URL: 'https://issuer.invalid/realms/mohamy',
    OIDC_CLIENT_ID: 'mohamy-api',
    OIDC_CLIENT_SECRET: 'client-secret-for-test',
    OIDC_AUDIENCE: 'mohamy-api',
    OIDC_REDIRECT_URI: 'https://api.invalid/api/v1/auth/callback',
    OIDC_POST_LOGOUT_REDIRECT_URI: 'https://app.invalid/en',
    OIDC_SCOPES: 'openid profile email',
    SESSION_COOKIE_NAME: 'mohamy_session',
    SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    SESSION_IDLE_TTL_SECONDS: 1800,
    SESSION_ABSOLUTE_TTL_SECONDS: 43200,
    SESSION_SECURE_COOKIE: true,
  };

  it('provides the approved development authentication defaults', () => {
    const environment = validateEnvironment(baseEnvironment);
    expect(environment.OIDC_ISSUER_URL).toBe(
      'http://127.0.0.1:58080/realms/mohamy',
    );
    expect(environment.OIDC_REDIRECT_URI).toBe(
      'http://127.0.0.1:3000/api/v1/auth/callback',
    );
    expect(environment.SESSION_COOKIE_NAME).toBe('mohamy_session');
    expect(environment.SESSION_SECURE_COOKIE).toBe(false);
    expect(environment.CSRF_HEADER_NAME).toBe('X-CSRF-Token');
  });

  it('accepts a valid production authentication configuration', () => {
    const environment = validateEnvironment(productionEnvironment);
    expect(environment.SESSION_ENCRYPTION_KEY).toBe(
      productionEnvironment.SESSION_ENCRYPTION_KEY,
    );
    expect(environment.SESSION_SECURE_COOKIE).toBe(true);
  });

  it('rejects a production authentication configuration with HTTP endpoints', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        OIDC_ISSUER_URL: 'http://issuer.invalid/realms/mohamy',
      }),
    ).toThrow('OIDC_ISSUER_URL must use HTTPS in production');
  });

  it('rejects an invalid session encryption key', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        SESSION_ENCRYPTION_KEY: 'not-a-32-byte-key',
      }),
    ).toThrow(
      'SESSION_ENCRYPTION_KEY must be an unpadded base64url-encoded 32-byte key',
    );
  });

  it('rejects an idle lifetime that is not shorter than the absolute lifetime', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        SESSION_IDLE_TTL_SECONDS: 100,
        SESSION_ABSOLUTE_TTL_SECONDS: 100,
      }),
    ).toThrow(
      'SESSION_IDLE_TTL_SECONDS must be less than SESSION_ABSOLUTE_TTL_SECONDS',
    );
  });

  it('rejects an invalid session cookie name', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        SESSION_COOKIE_NAME: 'mohamy;session',
      }),
    ).toThrow(
      'SESSION_COOKIE_NAME must contain only letters, numbers, and underscores',
    );
  });

  it('rejects a production CORS origin that is not an exact HTTPS origin', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        CORS_ORIGINS: 'http://app.invalid',
      }),
    ).toThrow('CORS_ORIGINS must contain exact HTTPS origins in production');
  });

  it('requires the openid scope', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        OIDC_SCOPES: 'profile email',
      }),
    ).toThrow('OIDC_SCOPES must include openid');
  });
});

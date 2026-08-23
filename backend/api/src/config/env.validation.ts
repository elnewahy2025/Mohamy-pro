export type NodeEnvironment = 'development' | 'test' | 'production';
export type StorageEncryptionMode = 'NONE' | 'AES256' | 'aws:kms';

export interface ValidatedEnvironment extends Record<string, unknown> {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_BUCKET: string;
  S3_VERSIONING_ENABLED: boolean;
  S3_OBJECT_LOCK_ENABLED: boolean;
  S3_ENCRYPTION_MODE: StorageEncryptionMode;
  S3_KMS_KEY_ID?: string;
  MALWARE_SCAN_ENABLED: boolean;
  CLAMAV_HOST?: string;
  CLAMAV_PORT: number;
  CORS_ORIGINS: string;
  FRONTEND_ORIGIN: string;
  OIDC_ISSUER_URL: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_AUDIENCE: string;
  OIDC_REDIRECT_URI: string;
  OIDC_POST_LOGOUT_REDIRECT_URI: string;
  OIDC_SCOPES: string;
  OIDC_HTTP_TIMEOUT_MS: number;
  OIDC_CLOCK_SKEW_SECONDS: number;
  OIDC_DISCOVERY_CACHE_SECONDS: number;
  SESSION_COOKIE_NAME: string;
  SESSION_ENCRYPTION_KEY?: string;
  SESSION_IDLE_TTL_SECONDS: number;
  SESSION_ABSOLUTE_TTL_SECONDS: number;
  SESSION_SECURE_COOKIE: boolean;
  CSRF_HEADER_NAME: string;
  METRICS_ENABLED: boolean;
  WORKER_METRICS_PORT: number;
  RATE_LIMIT_ENABLED: boolean;
  RATE_LIMIT_WINDOW_SECONDS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  METRICS_AUTH_TOKEN?: string;
  OTEL_ENABLED: boolean;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_SERVICE_NAME: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  const received =
    value === null
      ? 'null'
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ? value
        : typeof value;
  throw new Error(`Expected a boolean value; received ${received}`);
}

function readStorageEncryptionMode(value: unknown): StorageEncryptionMode {
  if (value === 'NONE' || value === 'AES256' || value === 'aws:kms') {
    return value;
  }
  throw new Error('S3_ENCRYPTION_MODE must be NONE, AES256, or aws:kms');
}

function readUrl(value: unknown, name: string): string {
  const candidate = readString(value);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
}

function readOrigin(value: unknown, name: string): string {
  const candidate = readUrl(value, name);
  if (!candidate) return '';
  const parsed = new URL(candidate);
  if (
    parsed.pathname !== '/' ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new Error(`${name} must be an exact HTTP(S) origin`);
  }
  return parsed.origin;
}

function readHeaderName(value: unknown): string {
  const candidate = readString(value) ?? 'X-CSRF-Token';
  if (!/^X-[A-Za-z0-9-]{1,63}$/.test(candidate)) {
    throw new Error('CSRF_HEADER_NAME must be an X- header name');
  }
  return candidate;
}

function readCookieName(value: unknown): string {
  const candidate = readString(value) ?? 'mohamy_session';
  if (!/^[A-Za-z0-9_]{1,64}$/.test(candidate)) {
    throw new Error(
      'SESSION_COOKIE_NAME must contain only letters, numbers, and underscores',
    );
  }
  return candidate;
}

function readSessionEncryptionKey(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) return undefined;
  try {
    const decoded = Buffer.from(candidate, 'base64url');
    if (decoded.length !== 32 || decoded.toString('base64url') !== candidate) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'SESSION_ENCRYPTION_KEY must be an unpadded base64url-encoded 32-byte key',
    );
  }
  return candidate;
}

function readPositiveInteger(
  value: unknown,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between 1 and ${maximum}; received ${String(value)}`,
    );
  }
  return parsed;
}

function readPort(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535; received ${String(value)}`,
    );
  }
  return parsed;
}

export function validateEnvironment(
  raw: Record<string, unknown>,
): ValidatedEnvironment {
  const nodeEnv = readString(raw.NODE_ENV) ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const databaseUrl = readString(raw.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const defaults =
    nodeEnv === 'production'
      ? {
          REDIS_URL: undefined,
          S3_ENDPOINT: undefined,
          S3_ACCESS_KEY: undefined,
          S3_SECRET_KEY: undefined,
          S3_BUCKET: undefined,
          S3_VERSIONING_ENABLED: undefined,
          S3_OBJECT_LOCK_ENABLED: undefined,
          S3_ENCRYPTION_MODE: undefined,
          MALWARE_SCAN_ENABLED: undefined,
          CLAMAV_HOST: undefined,
          CORS_ORIGINS: undefined,
          FRONTEND_ORIGIN: undefined,
          OIDC_ISSUER_URL: undefined,
          OIDC_CLIENT_ID: undefined,
          OIDC_AUDIENCE: undefined,
          OIDC_REDIRECT_URI: undefined,
          OIDC_POST_LOGOUT_REDIRECT_URI: undefined,
          OIDC_SCOPES: undefined,
          OIDC_CLIENT_SECRET: undefined,
          SESSION_COOKIE_NAME: undefined,
          SESSION_ENCRYPTION_KEY: undefined,
          SESSION_IDLE_TTL_SECONDS: undefined,
          SESSION_ABSOLUTE_TTL_SECONDS: undefined,
          SESSION_SECURE_COOKIE: undefined,
          CSRF_HEADER_NAME: undefined,
        }
      : {
          REDIS_URL: 'redis://localhost:56379',
          S3_ENDPOINT: 'http://localhost:59000',
          S3_ACCESS_KEY: 'minioadmin',
          S3_SECRET_KEY: 'minioadmin',
          S3_BUCKET: 'mohamy-development',
          S3_VERSIONING_ENABLED: true,
          S3_OBJECT_LOCK_ENABLED: false,
          S3_ENCRYPTION_MODE: 'NONE',
          MALWARE_SCAN_ENABLED: false,
          CLAMAV_HOST: undefined,
          CORS_ORIGINS: 'http://localhost:5173',
          FRONTEND_ORIGIN: 'http://localhost:5173',
          OIDC_ISSUER_URL: 'http://127.0.0.1:58080/realms/mohamy',
          OIDC_CLIENT_ID: 'mohamy-api',
          OIDC_AUDIENCE: 'mohamy-api',
          OIDC_REDIRECT_URI: 'http://127.0.0.1:3000/api/v1/auth/callback',
          OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5173/en',
          OIDC_SCOPES: 'openid profile email',
          OIDC_CLIENT_SECRET: undefined,
          SESSION_COOKIE_NAME: 'mohamy_session',
          SESSION_ENCRYPTION_KEY: undefined,
          SESSION_IDLE_TTL_SECONDS: 1_800,
          SESSION_ABSOLUTE_TTL_SECONDS: 43_200,
          SESSION_SECURE_COOKIE: false,
          CSRF_HEADER_NAME: 'X-CSRF-Token',
        };

  const storageEncryptionMode = readStorageEncryptionMode(
    raw.S3_ENCRYPTION_MODE ?? defaults.S3_ENCRYPTION_MODE,
  );
  const storageVersioningEnabled = readBoolean(
    raw.S3_VERSIONING_ENABLED,
    defaults.S3_VERSIONING_ENABLED ?? false,
  );
  const objectLockEnabled = readBoolean(
    raw.S3_OBJECT_LOCK_ENABLED,
    defaults.S3_OBJECT_LOCK_ENABLED ?? false,
  );
  const malwareScanEnabled = readBoolean(
    raw.MALWARE_SCAN_ENABLED,
    defaults.MALWARE_SCAN_ENABLED ?? false,
  );
  const clamavHost = readString(raw.CLAMAV_HOST) ?? defaults.CLAMAV_HOST;
  const clamavPort = readPort(raw.CLAMAV_PORT, 3310);
  const kmsKeyId = readString(raw.S3_KMS_KEY_ID);
  const frontendOrigin = readOrigin(
    raw.FRONTEND_ORIGIN ?? defaults.FRONTEND_ORIGIN,
    'FRONTEND_ORIGIN',
  );
  const oidcIssuerUrl = readUrl(
    raw.OIDC_ISSUER_URL ?? defaults.OIDC_ISSUER_URL,
    'OIDC_ISSUER_URL',
  );
  const oidcClientId =
    readString(raw.OIDC_CLIENT_ID) ?? defaults.OIDC_CLIENT_ID;
  const oidcClientSecret = readString(raw.OIDC_CLIENT_SECRET);
  const oidcAudience = readString(raw.OIDC_AUDIENCE) ?? defaults.OIDC_AUDIENCE;
  const oidcRedirectUri = readUrl(
    raw.OIDC_REDIRECT_URI ?? defaults.OIDC_REDIRECT_URI,
    'OIDC_REDIRECT_URI',
  );
  const oidcPostLogoutRedirectUri = readUrl(
    raw.OIDC_POST_LOGOUT_REDIRECT_URI ?? defaults.OIDC_POST_LOGOUT_REDIRECT_URI,
    'OIDC_POST_LOGOUT_REDIRECT_URI',
  );
  const oidcScopes =
    readString(raw.OIDC_SCOPES) ??
    defaults.OIDC_SCOPES ??
    'openid profile email';
  const corsOriginsForFrontendCheck = (
    readString(raw.CORS_ORIGINS) ??
    defaults.CORS_ORIGINS ??
    ''
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!corsOriginsForFrontendCheck.includes(frontendOrigin)) {
    throw new Error('FRONTEND_ORIGIN must be included in CORS_ORIGINS');
  }
  const oidcHttpTimeoutMs = readPositiveInteger(
    raw.OIDC_HTTP_TIMEOUT_MS,
    10_000,
    'OIDC_HTTP_TIMEOUT_MS',
    30_000,
  );
  const oidcClockSkewSeconds = readPositiveInteger(
    raw.OIDC_CLOCK_SKEW_SECONDS,
    30,
    'OIDC_CLOCK_SKEW_SECONDS',
    300,
  );
  const oidcDiscoveryCacheSeconds = readPositiveInteger(
    raw.OIDC_DISCOVERY_CACHE_SECONDS,
    300,
    'OIDC_DISCOVERY_CACHE_SECONDS',
    86_400,
  );
  const sessionCookieName = readCookieName(
    raw.SESSION_COOKIE_NAME ?? defaults.SESSION_COOKIE_NAME,
  );
  const sessionEncryptionKey = readSessionEncryptionKey(
    raw.SESSION_ENCRYPTION_KEY,
  );
  const sessionIdleTtlSeconds = readPositiveInteger(
    raw.SESSION_IDLE_TTL_SECONDS,
    defaults.SESSION_IDLE_TTL_SECONDS ?? 1_800,
    'SESSION_IDLE_TTL_SECONDS',
    86_400,
  );
  const sessionAbsoluteTtlSeconds = readPositiveInteger(
    raw.SESSION_ABSOLUTE_TTL_SECONDS,
    defaults.SESSION_ABSOLUTE_TTL_SECONDS ?? 43_200,
    'SESSION_ABSOLUTE_TTL_SECONDS',
    604_800,
  );
  const sessionSecureCookie = readBoolean(
    raw.SESSION_SECURE_COOKIE,
    defaults.SESSION_SECURE_COOKIE ?? false,
  );
  const csrfHeaderName = readHeaderName(
    raw.CSRF_HEADER_NAME ?? defaults.CSRF_HEADER_NAME,
  );
  if (!oidcScopes.split(/\s+/).includes('openid')) {
    throw new Error('OIDC_SCOPES must include openid');
  }
  if (sessionIdleTtlSeconds >= sessionAbsoluteTtlSeconds) {
    throw new Error(
      'SESSION_IDLE_TTL_SECONDS must be less than SESSION_ABSOLUTE_TTL_SECONDS',
    );
  }
  const otelEndpoint = readString(raw.OTEL_EXPORTER_OTLP_ENDPOINT);
  const metricsEnabled = readBoolean(raw.METRICS_ENABLED, true);
  const workerMetricsPort = readPort(raw.WORKER_METRICS_PORT, 3002);
  const rateLimitEnabled = readBoolean(raw.RATE_LIMIT_ENABLED, true);
  const rateLimitWindowSeconds = readPositiveInteger(
    raw.RATE_LIMIT_WINDOW_SECONDS,
    60,
    'RATE_LIMIT_WINDOW_SECONDS',
    3_600,
  );
  const rateLimitMaxRequests = readPositiveInteger(
    raw.RATE_LIMIT_MAX_REQUESTS,
    300,
    'RATE_LIMIT_MAX_REQUESTS',
    100_000,
  );
  const otelEnabled = readBoolean(raw.OTEL_ENABLED, Boolean(otelEndpoint));
  const metricsAuthToken = readString(raw.METRICS_AUTH_TOKEN);
  const otelServiceName =
    readString(raw.OTEL_SERVICE_NAME) ??
    (raw.WORKER_PROCESS === 'true' ? 'mohamy-worker' : 'mohamy-api');

  if (nodeEnv === 'production') {
    if (!rateLimitEnabled) {
      throw new Error('RATE_LIMIT_ENABLED must be true in production');
    }
    if (!storageVersioningEnabled) {
      throw new Error('S3_VERSIONING_ENABLED must be true in production');
    }
    if (!objectLockEnabled) {
      throw new Error('S3_OBJECT_LOCK_ENABLED must be true in production');
    }
    if (storageEncryptionMode === 'NONE') {
      throw new Error('S3_ENCRYPTION_MODE must not be NONE in production');
    }
    if (!malwareScanEnabled) {
      throw new Error('MALWARE_SCAN_ENABLED must be true in production');
    }
    if (!clamavHost) {
      throw new Error(
        'CLAMAV_HOST is required when malware scanning is enabled',
      );
    }
    if (storageEncryptionMode === 'aws:kms' && !kmsKeyId) {
      throw new Error('S3_KMS_KEY_ID is required for aws:kms encryption');
    }
    if (!oidcClientId)
      throw new Error('OIDC_CLIENT_ID is required in production');
    if (!oidcAudience)
      throw new Error('OIDC_AUDIENCE is required in production');
    if (!oidcClientSecret) {
      throw new Error('OIDC_CLIENT_SECRET is required in production');
    }
    if (!sessionEncryptionKey) {
      throw new Error('SESSION_ENCRYPTION_KEY is required in production');
    }
    if (!sessionSecureCookie) {
      throw new Error('SESSION_SECURE_COOKIE must be true in production');
    }
    if (raw.SESSION_IDLE_TTL_SECONDS === undefined) {
      throw new Error('SESSION_IDLE_TTL_SECONDS is required in production');
    }
    if (raw.SESSION_ABSOLUTE_TTL_SECONDS === undefined) {
      throw new Error('SESSION_ABSOLUTE_TTL_SECONDS is required in production');
    }
    if (raw.SESSION_COOKIE_NAME === undefined) {
      throw new Error('SESSION_COOKIE_NAME is required in production');
    }
    for (const [name, value] of [
      ['OIDC_ISSUER_URL', oidcIssuerUrl],
      ['OIDC_REDIRECT_URI', oidcRedirectUri],
      ['OIDC_POST_LOGOUT_REDIRECT_URI', oidcPostLogoutRedirectUri],
      ['FRONTEND_ORIGIN', frontendOrigin],
    ] as const) {
      if (!value.startsWith('https://')) {
        throw new Error(`${name} must use HTTPS in production`);
      }
    }
    const configuredCorsOrigins =
      readString(raw.CORS_ORIGINS) ?? defaults.CORS_ORIGINS ?? '';
    if (configuredCorsOrigins.includes('*')) {
      throw new Error('CORS_ORIGINS must not contain a wildcard in production');
    }
    const productionOrigins = configuredCorsOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (
      productionOrigins.length === 0 ||
      productionOrigins.some((origin) => {
        try {
          const parsed = new URL(origin);
          return (
            parsed.protocol !== 'https:' ||
            parsed.pathname !== '/' ||
            parsed.search.length > 0 ||
            parsed.hash.length > 0
          );
        } catch {
          return true;
        }
      })
    ) {
      throw new Error(
        'CORS_ORIGINS must contain exact HTTPS origins in production',
      );
    }
  }

  const values = {
    REDIS_URL: readString(raw.REDIS_URL) ?? defaults.REDIS_URL,
    S3_ENDPOINT: readString(raw.S3_ENDPOINT) ?? defaults.S3_ENDPOINT,
    S3_ACCESS_KEY: readString(raw.S3_ACCESS_KEY) ?? defaults.S3_ACCESS_KEY,
    S3_SECRET_KEY: readString(raw.S3_SECRET_KEY) ?? defaults.S3_SECRET_KEY,
    S3_BUCKET: readString(raw.S3_BUCKET) ?? defaults.S3_BUCKET,
    S3_VERSIONING_ENABLED: storageVersioningEnabled,
    S3_OBJECT_LOCK_ENABLED: objectLockEnabled,
    S3_ENCRYPTION_MODE: storageEncryptionMode,
    S3_KMS_KEY_ID: kmsKeyId,
    MALWARE_SCAN_ENABLED: malwareScanEnabled,
    CLAMAV_HOST: clamavHost,
    CLAMAV_PORT: clamavPort,
    CORS_ORIGINS: readString(raw.CORS_ORIGINS) ?? defaults.CORS_ORIGINS,
    FRONTEND_ORIGIN: frontendOrigin,
    OIDC_ISSUER_URL: oidcIssuerUrl,
    OIDC_CLIENT_ID: oidcClientId,
    OIDC_CLIENT_SECRET: oidcClientSecret,
    OIDC_AUDIENCE: oidcAudience,
    OIDC_REDIRECT_URI: oidcRedirectUri,
    OIDC_POST_LOGOUT_REDIRECT_URI: oidcPostLogoutRedirectUri,
    OIDC_SCOPES: oidcScopes,
    OIDC_HTTP_TIMEOUT_MS: oidcHttpTimeoutMs,
    OIDC_CLOCK_SKEW_SECONDS: oidcClockSkewSeconds,
    OIDC_DISCOVERY_CACHE_SECONDS: oidcDiscoveryCacheSeconds,
    SESSION_COOKIE_NAME: sessionCookieName,
    SESSION_ENCRYPTION_KEY: sessionEncryptionKey,
    SESSION_IDLE_TTL_SECONDS: sessionIdleTtlSeconds,
    SESSION_ABSOLUTE_TTL_SECONDS: sessionAbsoluteTtlSeconds,
    SESSION_SECURE_COOKIE: sessionSecureCookie,
    CSRF_HEADER_NAME: csrfHeaderName,
    METRICS_ENABLED: metricsEnabled,
    METRICS_AUTH_TOKEN: metricsAuthToken,
    OTEL_ENABLED: otelEnabled,
    OTEL_EXPORTER_OTLP_ENDPOINT: otelEndpoint,
    OTEL_SERVICE_NAME: otelServiceName,
  };

  const requiredValue = (key: string, value: string | undefined): string => {
    if (!value) {
      throw new Error(`${key} is required in production`);
    }
    return value;
  };

  return {
    ...raw,
    NODE_ENV: nodeEnv as NodeEnvironment,
    PORT: readPort(raw.PORT, 3000),
    DATABASE_URL: databaseUrl,
    REDIS_URL: requiredValue('REDIS_URL', values.REDIS_URL),
    S3_ENDPOINT: requiredValue('S3_ENDPOINT', values.S3_ENDPOINT),
    S3_ACCESS_KEY: requiredValue('S3_ACCESS_KEY', values.S3_ACCESS_KEY),
    S3_SECRET_KEY: requiredValue('S3_SECRET_KEY', values.S3_SECRET_KEY),
    S3_BUCKET: requiredValue('S3_BUCKET', values.S3_BUCKET),
    S3_VERSIONING_ENABLED: values.S3_VERSIONING_ENABLED,
    S3_OBJECT_LOCK_ENABLED: values.S3_OBJECT_LOCK_ENABLED,
    S3_ENCRYPTION_MODE: values.S3_ENCRYPTION_MODE,
    ...(values.S3_KMS_KEY_ID ? { S3_KMS_KEY_ID: values.S3_KMS_KEY_ID } : {}),
    MALWARE_SCAN_ENABLED: values.MALWARE_SCAN_ENABLED,
    ...(values.CLAMAV_HOST ? { CLAMAV_HOST: values.CLAMAV_HOST } : {}),
    CLAMAV_PORT: values.CLAMAV_PORT,
    CORS_ORIGINS: requiredValue('CORS_ORIGINS', values.CORS_ORIGINS),
    FRONTEND_ORIGIN: requiredValue('FRONTEND_ORIGIN', values.FRONTEND_ORIGIN),
    OIDC_ISSUER_URL: requiredValue('OIDC_ISSUER_URL', values.OIDC_ISSUER_URL),
    OIDC_CLIENT_ID: requiredValue('OIDC_CLIENT_ID', values.OIDC_CLIENT_ID),
    ...(values.OIDC_CLIENT_SECRET
      ? { OIDC_CLIENT_SECRET: values.OIDC_CLIENT_SECRET }
      : {}),
    OIDC_AUDIENCE: requiredValue('OIDC_AUDIENCE', values.OIDC_AUDIENCE),
    OIDC_REDIRECT_URI: requiredValue(
      'OIDC_REDIRECT_URI',
      values.OIDC_REDIRECT_URI,
    ),
    OIDC_POST_LOGOUT_REDIRECT_URI: requiredValue(
      'OIDC_POST_LOGOUT_REDIRECT_URI',
      values.OIDC_POST_LOGOUT_REDIRECT_URI,
    ),
    OIDC_SCOPES: requiredValue('OIDC_SCOPES', values.OIDC_SCOPES),
    OIDC_HTTP_TIMEOUT_MS: values.OIDC_HTTP_TIMEOUT_MS,
    OIDC_CLOCK_SKEW_SECONDS: values.OIDC_CLOCK_SKEW_SECONDS,
    OIDC_DISCOVERY_CACHE_SECONDS: values.OIDC_DISCOVERY_CACHE_SECONDS,
    SESSION_COOKIE_NAME: requiredValue(
      'SESSION_COOKIE_NAME',
      values.SESSION_COOKIE_NAME,
    ),
    ...(values.SESSION_ENCRYPTION_KEY
      ? { SESSION_ENCRYPTION_KEY: values.SESSION_ENCRYPTION_KEY }
      : {}),
    SESSION_IDLE_TTL_SECONDS: values.SESSION_IDLE_TTL_SECONDS,
    SESSION_ABSOLUTE_TTL_SECONDS: values.SESSION_ABSOLUTE_TTL_SECONDS,
    SESSION_SECURE_COOKIE: values.SESSION_SECURE_COOKIE,
    CSRF_HEADER_NAME: values.CSRF_HEADER_NAME,
    METRICS_ENABLED: values.METRICS_ENABLED,
    WORKER_METRICS_PORT: workerMetricsPort,
    RATE_LIMIT_ENABLED: rateLimitEnabled,
    RATE_LIMIT_WINDOW_SECONDS: rateLimitWindowSeconds,
    RATE_LIMIT_MAX_REQUESTS: rateLimitMaxRequests,
    ...(values.METRICS_AUTH_TOKEN
      ? { METRICS_AUTH_TOKEN: values.METRICS_AUTH_TOKEN }
      : {}),
    OTEL_ENABLED: values.OTEL_ENABLED,
    ...(values.OTEL_EXPORTER_OTLP_ENDPOINT
      ? { OTEL_EXPORTER_OTLP_ENDPOINT: values.OTEL_EXPORTER_OTLP_ENDPOINT }
      : {}),
    OTEL_SERVICE_NAME: values.OTEL_SERVICE_NAME,
  };
}

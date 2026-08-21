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

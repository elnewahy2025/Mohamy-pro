export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ValidatedEnvironment extends Record<string, unknown> {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_BUCKET: string;
  CORS_ORIGINS: string;
  METRICS_ENABLED: boolean;
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
          CORS_ORIGINS: undefined,
        }
      : {
          REDIS_URL: 'redis://localhost:56379',
          S3_ENDPOINT: 'http://localhost:59000',
          S3_ACCESS_KEY: 'minioadmin',
          S3_SECRET_KEY: 'minioadmin',
          S3_BUCKET: 'mohamy-development',
          CORS_ORIGINS: 'http://localhost:5173',
        };

  const otelEndpoint = readString(raw.OTEL_EXPORTER_OTLP_ENDPOINT);
  const metricsEnabled = readBoolean(raw.METRICS_ENABLED, true);
  const otelEnabled = readBoolean(raw.OTEL_ENABLED, Boolean(otelEndpoint));
  const metricsAuthToken = readString(raw.METRICS_AUTH_TOKEN);
  const otelServiceName =
    readString(raw.OTEL_SERVICE_NAME) ??
    (raw.WORKER_PROCESS === 'true' ? 'mohamy-worker' : 'mohamy-api');

  const values = {
    REDIS_URL: readString(raw.REDIS_URL) ?? defaults.REDIS_URL,
    S3_ENDPOINT: readString(raw.S3_ENDPOINT) ?? defaults.S3_ENDPOINT,
    S3_ACCESS_KEY: readString(raw.S3_ACCESS_KEY) ?? defaults.S3_ACCESS_KEY,
    S3_SECRET_KEY: readString(raw.S3_SECRET_KEY) ?? defaults.S3_SECRET_KEY,
    S3_BUCKET: readString(raw.S3_BUCKET) ?? defaults.S3_BUCKET,
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
    CORS_ORIGINS: requiredValue('CORS_ORIGINS', values.CORS_ORIGINS),
    METRICS_ENABLED: values.METRICS_ENABLED,
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

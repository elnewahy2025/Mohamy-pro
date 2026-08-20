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
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
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

  const values = {
    REDIS_URL: readString(raw.REDIS_URL) ?? defaults.REDIS_URL,
    S3_ENDPOINT: readString(raw.S3_ENDPOINT) ?? defaults.S3_ENDPOINT,
    S3_ACCESS_KEY: readString(raw.S3_ACCESS_KEY) ?? defaults.S3_ACCESS_KEY,
    S3_SECRET_KEY: readString(raw.S3_SECRET_KEY) ?? defaults.S3_SECRET_KEY,
    S3_BUCKET: readString(raw.S3_BUCKET) ?? defaults.S3_BUCKET,
    CORS_ORIGINS: readString(raw.CORS_ORIGINS) ?? defaults.CORS_ORIGINS,
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
  };
}

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
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  OIDC_POST_LOGOUT_REDIRECT_URI?: string;
  OIDC_SCOPE: string;
  SESSION_COOKIE_NAME: string;
  SESSION_SECRET: string;
  SESSION_IDLE_TTL_SECONDS: number;
  SESSION_ABSOLUTE_TTL_SECONDS: number;
  SESSION_SECURE_COOKIE: boolean;
  SESSION_CSRF_NAME: string;
  BOOTSTRAP_SUBJECT?: string;
  BOOTSTRAP_SECRET?: string;
  BOOTSTRAP_TENANT_SLUG?: string;
  BOOTSTRAP_TENANT_NAME?: string;
  BOOTSTRAP_ORG_SLUG?: string;
  BOOTSTRAP_ORG_NAME?: string;
  BOOTSTRAP_MFA_MAX_AGE_SECONDS: number;
  SENSITIVE_ACTION_MFA_MAX_AGE_SECONDS: number;
  INVITATION_TTL_SECONDS: number;
  ABUSE_LOGIN_PER_IP_MAX: number;
  ABUSE_LOGIN_PER_IP_WINDOW_SECONDS: number;
  ABUSE_LOGIN_PER_IDENTIFIER_MAX: number;
  ABUSE_LOGIN_PER_IDENTIFIER_WINDOW_SECONDS: number;
  ABUSE_AUTH_FAILURE_THRESHOLD: number;
  ABUSE_LOCKOUT_SECONDS: number;
  ABUSE_MFA_PER_ACTOR_MAX: number;
  ABUSE_MFA_PER_ACTOR_WINDOW_SECONDS: number;
  ABUSE_INVITATION_MAX: number;
  ABUSE_INVITATION_WINDOW_SECONDS: number;
  ABUSE_SWITCH_MAX: number;
  ABUSE_SWITCH_WINDOW_SECONDS: number;
  CLEANUP_OUTBOX_PROCESSED_DAYS: number;
  CLEANUP_OUTBOX_DEAD_LETTER_DAYS: number;
  CLEANUP_EXPIRED_SESSION_DAYS: number;
  CLEANUP_STORAGE_DAYS: number;
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
          OIDC_ISSUER: 'https://oidc.example.invalid',
          OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5173/auth/login',
          SESSION_SECRET: 'dev-only-session-secret-not-for-production-use',
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

  const oidcIssuer = readString(raw.OIDC_ISSUER);
  const oidcClientId = readString(raw.OIDC_CLIENT_ID);
  const oidcClientSecret = readString(raw.OIDC_CLIENT_SECRET);
  const oidcRedirectUri = readString(raw.OIDC_REDIRECT_URI);
  const oidcPostLogoutRedirectUri = readString(
    raw.OIDC_POST_LOGOUT_REDIRECT_URI,
  );
  const oidcScope =
    readString(raw.OIDC_SCOPE) ?? 'openid profile email offline_access';

  const sessionSecret = readString(raw.SESSION_SECRET);
  if (sessionSecret && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  const sessionCookieName =
    readString(raw.SESSION_COOKIE_NAME) ?? 'mohamy_session';
  const sessionCsrfName = readString(raw.SESSION_CSRF_NAME) ?? 'mohamy_csrf';
  const sessionIdleTtlSeconds = readPositiveInteger(
    raw.SESSION_IDLE_TTL_SECONDS,
    3_600,
    'SESSION_IDLE_TTL_SECONDS',
    86_400,
  );
  const sessionAbsoluteTtlSeconds = readPositiveInteger(
    raw.SESSION_ABSOLUTE_TTL_SECONDS,
    86_400,
    'SESSION_ABSOLUTE_TTL_SECONDS',
    2_592_000,
  );
  if (sessionAbsoluteTtlSeconds < sessionIdleTtlSeconds) {
    throw new Error(
      'SESSION_ABSOLUTE_TTL_SECONDS must not be lower than SESSION_IDLE_TTL_SECONDS',
    );
  }
  const sessionSecureCookie = readBoolean(raw.SESSION_SECURE_COOKIE, false);

  // One-time Platform bootstrap configuration (all optional). Every value is
  // fail-closed: an absent value simply disables bootstrap at runtime; a
  // malformed value that is present fails validation.
  const bootstrapSubject = readString(raw.BOOTSTRAP_SUBJECT);
  const bootstrapSecret = readString(raw.BOOTSTRAP_SECRET);
  const bootstrapTenantSlug = readString(raw.BOOTSTRAP_TENANT_SLUG);
  const bootstrapTenantName = readString(raw.BOOTSTRAP_TENANT_NAME);
  const bootstrapOrgSlug = readString(raw.BOOTSTRAP_ORG_SLUG);
  const bootstrapOrgName = readString(raw.BOOTSTRAP_ORG_NAME);
  if (bootstrapSecret !== undefined && bootstrapSecret.length < 16) {
    throw new Error('BOOTSTRAP_SECRET must be at least 16 characters');
  }
  const bootstrapMfaMaxAgeSeconds = readPositiveInteger(
    raw.BOOTSTRAP_MFA_MAX_AGE_SECONDS,
    900,
    'BOOTSTRAP_MFA_MAX_AGE_SECONDS',
    86_400,
  );
  const sensitiveActionMfaMaxAgeSeconds = readPositiveInteger(
    raw.SENSITIVE_ACTION_MFA_MAX_AGE_SECONDS,
    900,
    'SENSITIVE_ACTION_MFA_MAX_AGE_SECONDS',
    86_400,
  );
  const invitationTtlSeconds = readPositiveInteger(
    raw.INVITATION_TTL_SECONDS,
    604_800,
    'INVITATION_TTL_SECONDS',
    2_592_000,
  );
  const bootstrapConfigured =
    bootstrapSubject !== undefined ||
    bootstrapSecret !== undefined ||
    bootstrapTenantSlug !== undefined ||
    bootstrapTenantName !== undefined ||
    bootstrapOrgSlug !== undefined ||
    bootstrapOrgName !== undefined;
  if (bootstrapConfigured) {
    // A partial bootstrap configuration is a deployment error: it would make
    // the operator command unusable at runtime.
    const required = [
      bootstrapSubject,
      bootstrapSecret,
      bootstrapTenantSlug,
      bootstrapTenantName,
      bootstrapOrgSlug,
      bootstrapOrgName,
    ];
    if (required.some((value) => value === undefined || value.length === 0)) {
      throw new Error(
        'BOOTSTRAP_SUBJECT, BOOTSTRAP_SECRET, BOOTSTRAP_TENANT_SLUG, ' +
          'BOOTSTRAP_TENANT_NAME, BOOTSTRAP_ORG_SLUG, and BOOTSTRAP_ORG_NAME ' +
          'must all be set together to enable Platform bootstrap',
      );
    }
  }

  // Phase 2 abuse controls. Each limit/window is a validated positive integer
  // with a fixed production upper bound (see ABUSE_LIMIT_UPPER_BOUNDS in the
  // abuse constants); a configured value above its bound fails startup so a
  // misconfiguration cannot silently weaken a control.
  const abuseLoginPerIpMax = readPositiveInteger(
    raw.ABUSE_LOGIN_PER_IP_MAX,
    10,
    'ABUSE_LOGIN_PER_IP_MAX',
    10,
  );
  const abuseLoginPerIpWindowSeconds = readPositiveInteger(
    raw.ABUSE_LOGIN_PER_IP_WINDOW_SECONDS,
    900,
    'ABUSE_LOGIN_PER_IP_WINDOW_SECONDS',
    3_600,
  );
  const abuseLoginPerIdentifierMax = readPositiveInteger(
    raw.ABUSE_LOGIN_PER_IDENTIFIER_MAX,
    5,
    'ABUSE_LOGIN_PER_IDENTIFIER_MAX',
    5,
  );
  const abuseLoginPerIdentifierWindowSeconds = readPositiveInteger(
    raw.ABUSE_LOGIN_PER_IDENTIFIER_WINDOW_SECONDS,
    900,
    'ABUSE_LOGIN_PER_IDENTIFIER_WINDOW_SECONDS',
    3_600,
  );
  const abuseAuthFailureThreshold = readPositiveInteger(
    raw.ABUSE_AUTH_FAILURE_THRESHOLD,
    5,
    'ABUSE_AUTH_FAILURE_THRESHOLD',
    5,
  );
  const abuseLockoutSeconds = readPositiveInteger(
    raw.ABUSE_LOCKOUT_SECONDS,
    900,
    'ABUSE_LOCKOUT_SECONDS',
    3_600,
  );
  const abuseMfaPerActorMax = readPositiveInteger(
    raw.ABUSE_MFA_PER_ACTOR_MAX,
    5,
    'ABUSE_MFA_PER_ACTOR_MAX',
    5,
  );
  const abuseMfaPerActorWindowSeconds = readPositiveInteger(
    raw.ABUSE_MFA_PER_ACTOR_WINDOW_SECONDS,
    900,
    'ABUSE_MFA_PER_ACTOR_WINDOW_SECONDS',
    3_600,
  );
  const abuseInvitationMax = readPositiveInteger(
    raw.ABUSE_INVITATION_MAX,
    10,
    'ABUSE_INVITATION_MAX',
    10,
  );
  const abuseInvitationWindowSeconds = readPositiveInteger(
    raw.ABUSE_INVITATION_WINDOW_SECONDS,
    3_600,
    'ABUSE_INVITATION_WINDOW_SECONDS',
    86_400,
  );
  const abuseSwitchMax = readPositiveInteger(
    raw.ABUSE_SWITCH_MAX,
    20,
    'ABUSE_SWITCH_MAX',
    20,
  );
  const abuseSwitchWindowSeconds = readPositiveInteger(
    raw.ABUSE_SWITCH_WINDOW_SECONDS,
    600,
    'ABUSE_SWITCH_WINDOW_SECONDS',
    3_600,
  );
  const cleanupOutboxProcessedDays = readPositiveInteger(
    raw.CLEANUP_OUTBOX_PROCESSED_DAYS,
    7,
    'CLEANUP_OUTBOX_PROCESSED_DAYS',
    365,
  );
  const cleanupOutboxDeadLetterDays = readPositiveInteger(
    raw.CLEANUP_OUTBOX_DEAD_LETTER_DAYS,
    30,
    'CLEANUP_OUTBOX_DEAD_LETTER_DAYS',
    365,
  );
  const cleanupExpiredSessionDays = readPositiveInteger(
    raw.CLEANUP_EXPIRED_SESSION_DAYS,
    30,
    'CLEANUP_EXPIRED_SESSION_DAYS',
    365,
  );
  const cleanupStorageDays = readPositiveInteger(
    raw.CLEANUP_STORAGE_DAYS,
    30,
    'CLEANUP_STORAGE_DAYS',
    365,
  );

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
    const requiredOidc: Array<[string, string | undefined]> = [
      ['OIDC_ISSUER', oidcIssuer],
      ['OIDC_CLIENT_ID', oidcClientId],
      ['OIDC_CLIENT_SECRET', oidcClientSecret],
      ['OIDC_REDIRECT_URI', oidcRedirectUri],
      ['SESSION_SECRET', sessionSecret],
    ];
    for (const [key, value] of requiredOidc) {
      if (!value) {
        throw new Error(`${key} is required in production`);
      }
    }
    if (!sessionSecureCookie) {
      throw new Error('SESSION_SECURE_COOKIE must be true in production');
    }
    if (!oidcScope.includes('openid')) {
      throw new Error('OIDC_SCOPE must include the openid scope');
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
    OIDC_ISSUER: requiredValue(
      'OIDC_ISSUER',
      oidcIssuer ?? defaults.OIDC_ISSUER,
    ),
    ...(oidcClientId ? { OIDC_CLIENT_ID: oidcClientId } : {}),
    ...(oidcClientSecret ? { OIDC_CLIENT_SECRET: oidcClientSecret } : {}),
    ...(oidcRedirectUri ? { OIDC_REDIRECT_URI: oidcRedirectUri } : {}),
    ...((oidcPostLogoutRedirectUri ?? defaults.OIDC_POST_LOGOUT_REDIRECT_URI)
      ? {
          OIDC_POST_LOGOUT_REDIRECT_URI:
            oidcPostLogoutRedirectUri ?? defaults.OIDC_POST_LOGOUT_REDIRECT_URI,
        }
      : {}),
    OIDC_SCOPE: oidcScope,
    SESSION_COOKIE_NAME: sessionCookieName,
    SESSION_SECRET: requiredValue(
      'SESSION_SECRET',
      sessionSecret ?? defaults.SESSION_SECRET,
    ),
    SESSION_IDLE_TTL_SECONDS: sessionIdleTtlSeconds,
    SESSION_ABSOLUTE_TTL_SECONDS: sessionAbsoluteTtlSeconds,
    SESSION_SECURE_COOKIE: sessionSecureCookie,
    SESSION_CSRF_NAME: sessionCsrfName,
    BOOTSTRAP_MFA_MAX_AGE_SECONDS: bootstrapMfaMaxAgeSeconds,
    SENSITIVE_ACTION_MFA_MAX_AGE_SECONDS: sensitiveActionMfaMaxAgeSeconds,
    INVITATION_TTL_SECONDS: invitationTtlSeconds,
    ABUSE_LOGIN_PER_IP_MAX: abuseLoginPerIpMax,
    ABUSE_LOGIN_PER_IP_WINDOW_SECONDS: abuseLoginPerIpWindowSeconds,
    ABUSE_LOGIN_PER_IDENTIFIER_MAX: abuseLoginPerIdentifierMax,
    ABUSE_LOGIN_PER_IDENTIFIER_WINDOW_SECONDS:
      abuseLoginPerIdentifierWindowSeconds,
    ABUSE_AUTH_FAILURE_THRESHOLD: abuseAuthFailureThreshold,
    ABUSE_LOCKOUT_SECONDS: abuseLockoutSeconds,
    ABUSE_MFA_PER_ACTOR_MAX: abuseMfaPerActorMax,
    ABUSE_MFA_PER_ACTOR_WINDOW_SECONDS: abuseMfaPerActorWindowSeconds,
    ABUSE_INVITATION_MAX: abuseInvitationMax,
    ABUSE_INVITATION_WINDOW_SECONDS: abuseInvitationWindowSeconds,
    ABUSE_SWITCH_MAX: abuseSwitchMax,
    ABUSE_SWITCH_WINDOW_SECONDS: abuseSwitchWindowSeconds,
    CLEANUP_OUTBOX_PROCESSED_DAYS: cleanupOutboxProcessedDays,
    CLEANUP_OUTBOX_DEAD_LETTER_DAYS: cleanupOutboxDeadLetterDays,
    CLEANUP_EXPIRED_SESSION_DAYS: cleanupExpiredSessionDays,
    CLEANUP_STORAGE_DAYS: cleanupStorageDays,
    ...(bootstrapSubject ? { BOOTSTRAP_SUBJECT: bootstrapSubject } : {}),
    ...(bootstrapSecret ? { BOOTSTRAP_SECRET: bootstrapSecret } : {}),
    ...(bootstrapTenantSlug
      ? { BOOTSTRAP_TENANT_SLUG: bootstrapTenantSlug }
      : {}),
    ...(bootstrapTenantName
      ? { BOOTSTRAP_TENANT_NAME: bootstrapTenantName }
      : {}),
    ...(bootstrapOrgSlug ? { BOOTSTRAP_ORG_SLUG: bootstrapOrgSlug } : {}),
    ...(bootstrapOrgName ? { BOOTSTRAP_ORG_NAME: bootstrapOrgName } : {}),
  };
}

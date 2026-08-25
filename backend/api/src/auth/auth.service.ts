import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';
import { AuthenticationError, ProviderUnavailableError } from './auth.errors';
import type {
  AuthenticatedSession,
  OidcAuthorizationTransaction,
} from './auth.types';
import { OIDC_CLIENT, type OidcClientPort } from './oidc-client.port';
import { OidcTransactionStore } from './oidc-transaction.store';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(OIDC_CLIENT) private readonly oidc: OidcClientPort,
    private readonly transactions: OidcTransactionStore,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  async startLogin(returnTo: string | undefined): Promise<string> {
    const transaction: OidcAuthorizationTransaction = {
      state: randomBytes(32).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      codeVerifier: randomBytes(32).toString('base64url'),
      redirectUri: this.config.getOrThrow('OIDC_REDIRECT_URI'),
      returnTo: safeReturnTo(returnTo),
      createdAt: Date.now(),
    };
    const codeChallenge = base64UrlSha256(transaction.codeVerifier);
    try {
      const location = await this.oidc.buildAuthorizationUrl({
        state: transaction.state,
        nonce: transaction.nonce,
        codeChallenge,
        redirectUri: transaction.redirectUri,
      });
      await this.transactions.save(transaction);
      return location;
    } catch (error) {
      if (isProviderUnavailable(error)) throw new ProviderUnavailableError();
      throw new AuthenticationError('AUTHENTICATION_FAILED');
    }
  }

  async completeLogin(input: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<{ cookieValue: string; returnTo: string }> {
    if (input.error || !input.code || !input.state) {
      throw new AuthenticationError('AUTHENTICATION_FAILED');
    }
    const transaction = await this.transactions.consume(input.state);
    if (!transaction) throw new AuthenticationError('AUTHENTICATION_FAILED');

    let phase = 'token_exchange';
    try {
      const tokens = await this.oidc.exchangeCode(
        input.code,
        transaction.codeVerifier,
      );
      phase = 'id_token_validation';
      const identityClaims = await this.oidc.verifyIdToken(
        tokens.id_token,
        transaction.nonce,
      );
      phase = 'access_token_validation';
      const accessClaims = await this.oidc.verifyAccessToken(
        tokens.access_token,
      );
      phase = 'subject_consistency';
      if (identityClaims.sub !== accessClaims.sub) {
        throw new AuthenticationError('AUTHENTICATION_FAILED');
      }
      phase = 'session_creation';
      const { cookieValue } = await this.sessions.createFromOidc(
        identityClaims,
        tokens,
      );
      return { cookieValue, returnTo: transaction.returnTo };
    } catch (error) {
      const reason = phase.endsWith('_validation')
        ? `|reason=${safeValidationReason(error)}`
        : '';
      const databaseDiagnostic =
        phase === 'session_creation'
          ? `|db_code=${safeDatabaseCode(error)}|db_model=${safeDatabaseModel(error)}|driver_code=${safeDatabaseDriverCode(error)}|driver_kind=${safeDatabaseDriverKind(error)}|driver_category=${safeDatabaseDriverCategory(error)}|driver_boundary=${safeDatabaseDriverBoundary(error)}`
          : '';
      this.logger.warn(
        `OIDC callback rejected during ${phase}${reason}|error=${safeErrorName(error)}${databaseDiagnostic}`,
      );
      if (error instanceof AuthenticationError) throw error;
      if (isProviderUnavailable(error)) throw new ProviderUnavailableError();
      throw new AuthenticationError('AUTHENTICATION_FAILED');
    }
  }

  async getSession(cookie: string): Promise<AuthenticatedSession> {
    const session = await this.sessions.findByCookie(cookie);
    if (!session) throw new AuthenticationError();
    return session;
  }

  async logout(cookie: string): Promise<void> {
    await this.sessions.revokeByCookie(cookie, 'user_logout');
  }
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !/^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(value)) {
    return '/en';
  }
  return value;
}

function base64UrlSha256(value: string): string {
  return createHash('sha256').update(value, 'ascii').digest('base64url');
}

function safeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

function safeDatabaseCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'none';
  const candidate = error as Record<string, unknown>;
  return typeof candidate.code === 'string' &&
    /^P[0-9]{4}$/.test(candidate.code)
    ? candidate.code
    : 'none';
}

function safeDatabaseModel(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'none';
  const candidate = error as Record<string, unknown>;
  const meta = candidate.meta;
  if (typeof meta !== 'object' || meta === null) return 'none';
  const model = (meta as Record<string, unknown>).modelName;
  return typeof model === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(model)
    ? model
    : 'none';
}

function safeDatabaseDriverCode(error: unknown): string {
  const cause = databaseDriverCause(error);
  if (
    typeof cause?.originalCode === 'string' &&
    /^[0-9A-Z]{5}$/.test(cause.originalCode)
  ) {
    return cause.originalCode;
  }
  const message = error instanceof Error ? error.message : '';
  const match = message.match(/Database error\. Code:\s*`?([0-9A-Z]{5})`?/i);
  return match?.[1]?.toUpperCase() ?? 'none';
}

function safeDatabaseDriverKind(error: unknown): string {
  const cause = databaseDriverCause(error);
  return typeof cause?.kind === 'string' &&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(cause.kind)
    ? cause.kind
    : 'none';
}

function safeDatabaseDriverCategory(error: unknown): string {
  const code = safeDatabaseDriverCode(error);
  if (code === '42501') return 'insufficient_privilege';
  if (code === '23505') return 'unique_violation';
  if (code === '23503') return 'foreign_key_violation';
  if (code === '23502') return 'not_null_violation';
  if (code === '22P02') return 'invalid_text_representation';
  if (code === '42P01') return 'undefined_table';
  if (code === '42703') return 'undefined_column';
  if (code === '40001') return 'serialization_failure';
  if (code === '40P01') return 'deadlock_detected';
  if (code === 'P0001') return 'database_raise_exception';
  return 'unknown';
}

function safeDatabaseDriverBoundary(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/row-level security policy|violates row-level security/i.test(message)) {
    return 'rls_policy';
  }
  if (
    /permission denied for (table|schema|column|sequence|function)/i.test(
      message,
    )
  ) {
    return 'object_privilege';
  }
  if (/permission denied/i.test(message)) return 'permission_other';
  if (/foreign key constraint/i.test(message)) return 'foreign_key';
  if (/violates (a )?check constraint|check constraint/i.test(message)) {
    return 'check_constraint';
  }
  return 'unknown';
}

function databaseDriverCause(error: unknown): Record<string, unknown> | null {
  if (typeof error !== 'object' || error === null) return null;
  const driver = (error as Record<string, unknown>).driverAdapterError;
  if (typeof driver !== 'object' || driver === null) return null;
  const cause = (driver as Record<string, unknown>).cause;
  return typeof cause === 'object' && cause !== null
    ? (cause as Record<string, unknown>)
    : null;
}

function safeValidationReason(error: unknown): string {
  const joseError = asJoseError(error);
  if (joseError.code === 'ERR_JWT_EXPIRED') {
    return 'temporal_claim_rejected';
  }
  if (joseError.code === 'ERR_JOSE_ALG_NOT_ALLOWED') {
    return 'algorithm_mismatch';
  }
  if (
    joseError.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' ||
    joseError.code === 'ERR_JWK_INVALID' ||
    joseError.code === 'ERR_JWKS_INVALID' ||
    joseError.code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS' ||
    joseError.code === 'ERR_JWKS_NO_MATCHING_KEY' ||
    joseError.code === 'ERR_JWKS_TIMEOUT'
  ) {
    return 'signature_or_key_rejected';
  }
  if (
    joseError.code === 'ERR_JWS_INVALID' ||
    joseError.code === 'ERR_JWT_INVALID'
  ) {
    return 'jwt_token_invalid';
  }
  if (joseError.code === 'ERR_OIDC_REQUIRED_CLAIM') {
    if (joseError.claim === 'iss') return 'required_issuer_claim_rejected';
    if (joseError.claim === 'sub') return 'required_subject_claim_rejected';
    if (joseError.claim === 'exp') {
      return 'required_expiration_claim_rejected';
    }
    if (joseError.claim === 'iat') return 'required_issued_at_claim_rejected';
    if (joseError.claim === 'nonce') return 'required_nonce_claim_rejected';
    return 'jwt_claim_rejected';
  }
  if (
    joseError.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' ||
    joseError.name === 'JWTClaimValidationFailed'
  ) {
    if (joseError.claim === 'aud') return 'audience_mismatch';
    if (joseError.claim === 'iss') return 'issuer_mismatch';
    if (joseError.claim === 'nonce') return 'nonce_mismatch';
    if (['exp', 'iat', 'nbf'].includes(joseError.claim ?? '')) {
      return 'temporal_claim_rejected';
    }
    return 'jwt_claim_rejected';
  }
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message === 'oidc token claims are incomplete') {
    return 'jwt_claim_rejected';
  }
  if (/\baud\b|audience/.test(message)) return 'audience_mismatch';
  if (/\biss\b|issuer/.test(message)) return 'issuer_mismatch';
  if (/\bnonce\b/.test(message)) return 'nonce_mismatch';
  if (/signature|jwks|key/.test(message)) return 'signature_or_key_rejected';
  if (/exp|nbf|iat|clock|timestamp|expired/.test(message)) {
    return 'temporal_claim_rejected';
  }
  return 'jwt_validation_rejected';
}

function asJoseError(error: unknown): {
  code?: string;
  name?: string;
  claim?: string;
} {
  if (typeof error !== 'object' || error === null) return {};
  const candidate = error as Record<string, unknown>;
  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    claim: typeof candidate.claim === 'string' ? candidate.claim : undefined,
  };
}

function isProviderUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed out|fetch failed|ECONN|ENOTFOUND|HTTP 5\d\d/i.test(message);
}

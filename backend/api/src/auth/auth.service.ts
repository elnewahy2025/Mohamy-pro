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
      this.logger.warn(
        `OIDC callback rejected during ${phase}${reason}|error=${safeErrorName(error)}`,
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

function safeValidationReason(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/\baud\b|audience/.test(message)) return 'audience_mismatch';
  if (/\biss\b|issuer/.test(message)) return 'issuer_mismatch';
  if (/\bnonce\b/.test(message)) return 'nonce_mismatch';
  if (/signature|jwks|key/.test(message)) return 'signature_or_key_rejected';
  if (/exp|nbf|iat|clock|timestamp|expired/.test(message)) {
    return 'temporal_claim_rejected';
  }
  return 'jwt_validation_rejected';
}

function isProviderUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed out|fetch failed|ECONN|ENOTFOUND|HTTP 5\d\d/i.test(message);
}

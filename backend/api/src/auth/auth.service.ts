import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AbuseControlService } from '../abuse/abuse-control.service';
import { AbuseLimitReachedError } from '../abuse/abuse-control.errors';
import type { ValidatedEnvironment } from '../config/env.validation';
import {
  OidcInteractionError,
  OidcTokenValidationError,
  SessionNotFoundError,
} from './auth.errors';
import { IdentityService } from './identity.service';
import { OidcProviderService } from './oidc/oidc-provider.service';
import { SessionCookieService } from './session/session-cookie.service';
import { decryptSecret, encryptSecret } from './session/session-crypto';
import { SessionService, type SessionDetails } from './session/session.service';

export interface BeginLoginResult {
  redirectUrl: string;
}

export interface CallbackResult {
  redirectUrl: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly oidc: OidcProviderService,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly cookies: SessionCookieService,
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
    private readonly abuse: AbuseControlService,
  ) {}

  private sessionSecret(): string {
    return this.configService.getOrThrow('SESSION_SECRET');
  }

  async beginLogin(req: Request, res: Response): Promise<BeginLoginResult> {
    const ipDecision = await this.abuse.enforceLoginIp(req);
    if (!ipDecision.allowed) {
      await this.abuse.emitAbuseEvent(req, ipDecision.reason!);
      throw new AbuseLimitReachedError(
        ipDecision.reason!,
        ipDecision.retryAfterSeconds!,
      );
    }
    const identifierDecision = await this.abuse.enforceLoginIdentifier(req);
    if (identifierDecision && !identifierDecision.allowed) {
      await this.abuse.emitAbuseEvent(req, identifierDecision.reason!);
      throw new AbuseLimitReachedError(
        identifierDecision.reason!,
        identifierDecision.retryAfterSeconds!,
      );
    }
    const auth = await this.oidc.buildAuthorizationUrl();
    const payload = JSON.stringify({
      state: auth.state,
      nonce: auth.nonce,
      codeVerifier: auth.codeVerifier,
    });
    this.cookies.setOidc(res, encryptSecret(this.sessionSecret(), payload));
    return { redirectUrl: auth.url };
  }

  async handleCallback(req: Request, res: Response): Promise<CallbackResult> {
    const oidcCookie = this.cookies.readOidc(req);
    if (!oidcCookie) {
      throw new OidcInteractionError('Missing OIDC interaction cookie');
    }
    const payload = decryptSecret(this.sessionSecret(), oidcCookie);
    if (!payload) {
      throw new OidcInteractionError('Invalid OIDC interaction cookie');
    }
    const parsed = JSON.parse(payload) as {
      state?: string;
      nonce?: string;
      codeVerifier?: string;
    };
    if (!parsed.state || !parsed.nonce || !parsed.codeVerifier) {
      throw new OidcInteractionError('Incomplete OIDC interaction state');
    }

    const redirectUri = this.configService.getOrThrow('OIDC_REDIRECT_URI');
    const query = req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1)
      : '';
    const currentUrl = new URL(`${redirectUri}?${query}`);

    const { tokens, profile } = await this.oidc.exchangeCode(
      currentUrl,
      parsed.codeVerifier,
      parsed.state,
      parsed.nonce,
    );

    const identifier = profile.subject;

    const lockDecision = await this.abuse.checkLockout(identifier);
    if (!lockDecision.allowed) {
      await this.abuse.emitAbuseEvent(req, lockDecision.reason!);
      throw new AbuseLimitReachedError(
        lockDecision.reason!,
        lockDecision.retryAfterSeconds!,
      );
    }

    const user = await this.identity.resolveUser(profile);
    if (!tokens.refreshToken) {
      const failureDecision =
        await this.abuse.registerAuthenticationFailure(identifier);
      if (!failureDecision.allowed) {
        await this.abuse.emitAbuseEvent(req, failureDecision.reason!);
        throw new AbuseLimitReachedError(
          failureDecision.reason!,
          failureDecision.retryAfterSeconds!,
        );
      }
      throw new OidcTokenValidationError(
        'Provider did not return a refresh token',
      );
    }

    const created = await this.sessions.createSession({
      user,
      profile,
      tokens,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    await this.abuse.releaseLockout(req, identifier);

    this.cookies.setSession(res, created.token, created.maxAgeSeconds);
    this.cookies.clearOidc(res);

    const postLogout = this.configService.get<string>(
      'OIDC_POST_LOGOUT_REDIRECT_URI',
    );
    return { redirectUrl: postLogout ?? '/' };
  }

  async logout(req: Request, res: Response): Promise<{ redirectUrl: string }> {
    const token = this.cookies.readSession(req);
    if (token) {
      try {
        const details = await this.sessions.validateSession(token);
        const refresh = await this.sessions.getRefreshToken(details.sessionId);
        const idToken = await this.sessions.getIdToken(details.sessionId);
        await this.sessions.revokeSession(details.sessionId, 'logout');
        if (refresh) {
          try {
            await this.oidc.revoke(refresh);
          } catch {
            // Provider revocation is best-effort; the local session is already revoked.
          }
        }
        const postLogout = this.configService.get<string>(
          'OIDC_POST_LOGOUT_REDIRECT_URI',
        );
        let endSession: string;
        try {
          endSession = this.oidc.buildLogoutUrl({
            idTokenHint: idToken ?? undefined,
            postLogoutRedirectUri: postLogout ?? undefined,
          });
        } catch {
          endSession = postLogout ?? '/';
        }
        this.cookies.clearSession(res);
        this.cookies.clearOidc(res);
        return { redirectUrl: endSession };
      } catch (error) {
        if (!(error instanceof SessionNotFoundError)) {
          throw error;
        }
      }
    }
    this.cookies.clearSession(res);
    const postLogout = this.configService.get<string>(
      'OIDC_POST_LOGOUT_REDIRECT_URI',
    );
    return { redirectUrl: postLogout ?? '/' };
  }

  async me(auth: SessionDetails): Promise<{
    userId: string;
    username: string | null;
    activeTenantId: string | null;
  }> {
    const username = await this.identity.getDisplayName(auth.userId);
    return {
      userId: auth.userId,
      username,
      activeTenantId: auth.activeTenantId,
    };
  }

  async issueCsrf(auth: SessionDetails): Promise<{ csrfToken: string }> {
    return { csrfToken: await this.sessions.issueCsrfToken(auth.sessionId) };
  }
}

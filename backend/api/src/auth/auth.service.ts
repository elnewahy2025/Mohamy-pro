import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { AbuseControlService } from '../abuse/abuse-control.service';
import { AbuseLimitReachedError } from '../abuse/abuse-control.errors';
import type { ValidatedEnvironment } from '../config/env.validation';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import {
  OidcInteractionError,
  OidcTokenValidationError,
  SessionNotFoundError,
} from './auth.errors';
import { IdentityService } from './identity.service';
import { OidcProviderService } from './oidc/oidc-provider.service';
import { SessionCookieService } from './session/session-cookie.service';
import {
  decryptSecret,
  encryptSecret,
  hashToken,
} from './session/session-crypto';
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
    private readonly audit: AuditEventService,
  ) {}

  private privateAsHash(value: string | undefined): string | null {
    return value ? hashToken(value) : null;
  }

  private async emitLoginDenied(
    request: Request,
    reason: string,
  ): Promise<void> {
    try {
      await this.audit.write({
        eventType: AUDIT_EVENT_TYPES.LOGIN_DENIED,
        outcome: 'DENIED',
        actorUserId: null,
        tenantId: null,
        policy: 'AuthLifecycle',
        reasonCode: reason,
        correlationId: getCorrelationId(request),
        ipHash: this.privateAsHash(request.ip),
        userAgentHash: this.privateAsHash(request.headers['user-agent']),
        metadata: { reason },
      });
    } catch {
      // A failed login is already denied; an audit write must not change the
      // controlled denial outcome.
    }
  }

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
    try {
      await this.audit.write({
        eventType: AUDIT_EVENT_TYPES.LOGIN_STARTED,
        outcome: 'SUCCEEDED',
        actorUserId: null,
        tenantId: null,
        policy: 'AuthLifecycle',
        correlationId: getCorrelationId(req),
        ipHash: this.privateAsHash(req.ip),
        userAgentHash: this.privateAsHash(req.headers['user-agent']),
        metadata: {},
      });
    } catch {
      // A login initiation is not a privileged state change; an audit write
      // failure must not block the redirect to the provider.
    }
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
      await this.emitLoginDenied(req, 'NO_REFRESH_TOKEN');
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

    try {
      await this.audit.write({
        eventType: AUDIT_EVENT_TYPES.LOGIN_SUCCEEDED,
        outcome: 'SUCCEEDED',
        actorUserId: user.id,
        tenantId: null,
        policy: 'AuthLifecycle',
        correlationId: getCorrelationId(req),
        ipHash: this.privateAsHash(req.ip),
        userAgentHash: this.privateAsHash(req.headers['user-agent']),
        metadata: {},
      });
    } catch {
      // Session creation already succeeded; record the lifecycle event but do
      // not fail the established session over a secondary audit write.
    }

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
        try {
          await this.audit.write({
            eventType: AUDIT_EVENT_TYPES.LOGOUT,
            outcome: 'SUCCEEDED',
            actorUserId: details.userId,
            tenantId: details.activeTenantId,
            policy: 'AuthLifecycle',
            correlationId: getCorrelationId(req),
            ipHash: this.privateAsHash(req.ip),
            userAgentHash: this.privateAsHash(req.headers['user-agent']),
            metadata: {},
          });
        } catch {
          // The session is already revoked; do not fail logout over the
          // secondary audit write.
        }
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

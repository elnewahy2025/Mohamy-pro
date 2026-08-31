import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import { AuditEventService } from '../audit/audit-event.service';
import {
  AUDIT_EVENT_TYPES,
  type AuditEventType,
} from '../audit/audit-constants';
import {
  ABUSE_LIMITS,
  ACCOUNT_LOCKED,
  AUTH_RATE_LIMITED,
  INVITATION_RATE_LIMITED,
  MFA_RATE_LIMITED,
  TENANT_SWITCH_RATE_LIMITED,
  hashAbuseKey,
  type AbuseLimitReason,
} from './abuse-control.constants';
import { AbuseCounterService } from './abuse-counter.service';
import {
  abuseAccountIdentifier,
  abuseClientIp,
  abuseInvitationToken,
} from './abuse-request';

export interface AbuseDecision {
  allowed: boolean;
  reason: AbuseLimitReason | null;
  retryAfterSeconds: number | null;
}

interface LimitPolicy {
  scopePrefix: string;
  limit: number;
  windowSeconds: number;
  reason: AbuseLimitReason;
}

/**
 * Orchestrates the Phase 2 abuse controls: per-operation fixed-window limits,
 * the failed-auth lockout boundary, and controlled audit emission. A Redis
 * counter that is unavailable reads as "allowed" here; callers that require a
 * hard guarantee must treat unavailability as a fail-closed rejection.
 */
@Injectable()
export class AbuseControlService {
  constructor(
    private readonly counter: AbuseCounterService,
    private readonly audit: AuditEventService,
  ) {}

  private async enforceRateLimit(
    request: Request,
    policy: LimitPolicy,
    actor: string,
  ): Promise<AbuseDecision> {
    const bucket = Math.floor(Date.now() / (policy.windowSeconds * 1_000));
    const key = AbuseCounterService.scopedKey(
      policy.scopePrefix,
      actor,
      String(bucket),
    );
    const count = await this.counter.increment(key, policy.windowSeconds);
    if (count === null) {
      return { allowed: true, reason: null, retryAfterSeconds: null };
    }
    if (count > policy.limit) {
      return {
        allowed: false,
        reason: policy.reason,
        retryAfterSeconds: policy.windowSeconds,
      };
    }
    return { allowed: true, reason: null, retryAfterSeconds: null };
  }

  /** Login initiation per source IP: 10 in 15 minutes. */
  async enforceLoginIp(request: Request): Promise<AbuseDecision> {
    return this.enforceRateLimit(request, {
      scopePrefix: 'login-ip',
      limit: ABUSE_LIMITS.loginPerIp.max,
      windowSeconds: ABUSE_LIMITS.loginPerIp.windowSeconds,
      reason: AUTH_RATE_LIMITED,
    }, abuseClientIp(request));
  }

  /** Login initiation per account identifier: 5 in 15 minutes (null when absent). */
  async enforceLoginIdentifier(request: Request): Promise<AbuseDecision | null> {
    const identifier = abuseAccountIdentifier(request);
    if (!identifier) return null;
    return this.enforceRateLimit(request, {
      scopePrefix: 'login-id',
      limit: ABUSE_LIMITS.loginPerIdentifier.max,
      windowSeconds: ABUSE_LIMITS.loginPerIdentifier.windowSeconds,
      reason: AUTH_RATE_LIMITED,
    }, identifier);
  }

  /** Invitation acceptance per fingerprint + IP: 10 in one hour (null when absent). */
  async enforceInvitation(request: Request): Promise<AbuseDecision | null> {
    const token = abuseInvitationToken(request);
    if (!token) return null;
    const actor = `${abuseClientIp(request)}::${token}`;
    return this.enforceRateLimit(request, {
      scopePrefix: 'invite',
      limit: ABUSE_LIMITS.invitationPerFingerprint.max,
      windowSeconds: ABUSE_LIMITS.invitationPerFingerprint.windowSeconds,
      reason: INVITATION_RATE_LIMITED,
    }, actor);
  }

  /** Tenant switching per user/session: 20 in 10 minutes. */
  async enforceTenantSwitch(
    request: Request,
    userId: string,
  ): Promise<AbuseDecision> {
    return this.enforceRateLimit(request, {
      scopePrefix: 'switch',
      limit: ABUSE_LIMITS.switchPerActor.max,
      windowSeconds: ABUSE_LIMITS.switchPerActor.windowSeconds,
      reason: TENANT_SWITCH_RATE_LIMITED,
    }, userId);
  }

  /**
   * Failed-auth lockout boundary: after `lockoutThreshold` failures within the
   * window the identifier is locked for `lockoutSeconds` and must re-authenticate.
   */
  async registerAuthenticationFailure(
    identifier: string,
  ): Promise<AbuseDecision> {
    const hash = hashAbuseKey(identifier);
    const bucket = Math.floor(
      Date.now() / (ABUSE_LIMITS.lockoutSeconds * 1_000),
    );
    const counterKey = AbuseCounterService.scopedKey(
      'auth-fail',
      hash,
      String(bucket),
    );
    const count = await this.counter.increment(
      counterKey,
      ABUSE_LIMITS.lockoutSeconds,
    );
    if (count === null) {
      return { allowed: true, reason: null, retryAfterSeconds: null };
    }
    if (count >= ABUSE_LIMITS.lockoutThreshold) {
      await this.counter.setMarker(
        `mohamy:abuse:auth-lockout:${hash}`,
        ABUSE_LIMITS.lockoutSeconds,
      );
      return {
        allowed: false,
        reason: ACCOUNT_LOCKED,
        retryAfterSeconds: ABUSE_LIMITS.lockoutSeconds,
      };
    }
    return { allowed: true, reason: null, retryAfterSeconds: null };
  }

  /** Read-only lockout decision for an identifier (no increment). */
  async checkLockout(identifier: string): Promise<AbuseDecision> {
    const hash = hashAbuseKey(identifier);
    const locked = await this.counter.hasMarker(
      `mohamy:abuse:auth-lockout:${hash}`,
    );
    if (locked) {
      return {
        allowed: false,
        reason: ACCOUNT_LOCKED,
        retryAfterSeconds: ABUSE_LIMITS.lockoutSeconds,
      };
    }
    return { allowed: true, reason: null, retryAfterSeconds: null };
  }

  /** MFA step-up: 5 failed challenges per session/user/IP in 15 minutes. */
  async enforceMfaFailure(
    actor: string,
  ): Promise<AbuseDecision> {
    const policy: LimitPolicy = {
      scopePrefix: 'mfa',
      limit: ABUSE_LIMITS.mfaPerActor.max,
      windowSeconds: ABUSE_LIMITS.mfaPerActor.windowSeconds,
      reason: MFA_RATE_LIMITED,
    };
    return this.enforceRateLimit(
      { method: 'POST', body: {}, originalUrl: '' } as unknown as Request,
      policy,
      actor,
    );
  }

  /** Emit a controlled abuse audit event; never throws into the request path. */
  async emitAbuseEvent(
    request: Request,
    reason: AbuseLimitReason,
    extra: { actorUserId?: string | null; tenantId?: string | null } = {},
  ): Promise<void> {
    const eventType = this.eventTypeForReason(reason);
    try {
      await this.audit.write({
        eventType,
        outcome: 'DENIED',
        actorUserId: extra.actorUserId ?? null,
        actorMembershipId: null,
        tenantId: extra.tenantId ?? null,
        targetType: null,
        targetId: null,
        policy: 'AbuseControl',
        reasonCode: reason,
        correlationId: getCorrelationId(request),
        ipHash: hashAbuseKey(abuseClientIp(request)),
        metadata: { reason },
      });
    } catch {
      // Audit write failure must not amplify a blocked request into a 500.
    }
  }

  private eventTypeForReason(reason: AbuseLimitReason): AuditEventType {
    switch (reason) {
      case ACCOUNT_LOCKED:
        return AUDIT_EVENT_TYPES.ACCOUNT_LOCKED;
      case AUTH_RATE_LIMITED:
        return AUDIT_EVENT_TYPES.AUTH_RATE_LIMITED;
      case MFA_RATE_LIMITED:
        return AUDIT_EVENT_TYPES.MFA_RATE_LIMITED;
      case TENANT_SWITCH_RATE_LIMITED:
        return AUDIT_EVENT_TYPES.TENANT_SWITCH_RATE_LIMITED;
      case INVITATION_RATE_LIMITED:
        return AUDIT_EVENT_TYPES.INVITATION_RATE_LIMITED;
      default:
        return AUDIT_EVENT_TYPES.AUTH_RATE_LIMITED;
    }
  }
}

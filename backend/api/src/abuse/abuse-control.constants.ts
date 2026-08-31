import { createHash } from 'node:crypto';

export const AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED';
export const MFA_RATE_LIMITED = 'MFA_RATE_LIMITED';
export const TENANT_SWITCH_RATE_LIMITED = 'TENANT_SWITCH_RATE_LIMITED';
export const INVITATION_RATE_LIMITED = 'INVITATION_RATE_LIMITED';
export const ACCOUNT_LOCKED = 'ACCOUNT_LOCKED';

export type AbuseLimitReason =
  | typeof AUTH_RATE_LIMITED
  | typeof MFA_RATE_LIMITED
  | typeof TENANT_SWITCH_RATE_LIMITED
  | typeof INVITATION_RATE_LIMITED
  | typeof ACCOUNT_LOCKED;

export interface AbuseRateLimit {
  max: number;
  windowSeconds: number;
}

/**
 * Abuse-control limits and lockout thresholds per the Phase 2
 * ABUSE_AND_IDENTITY_DATA_LIFECYCLE_DECISION.md. These are fixed configuration
 * values with production upper bounds; changing the threat-model numbers
 * requires an architecture/configuration review.
 */
export const ABUSE_LIMITS = {
  /** Login initiation: 10 attempts per source IP in 15 minutes. */
  loginPerIp: { max: 10, windowSeconds: 900 } satisfies AbuseRateLimit,
  /** Login initiation: 5 attempts per normalized account identifier in 15 minutes. */
  loginPerIdentifier: { max: 5, windowSeconds: 900 } satisfies AbuseRateLimit,
  /** Failed auth: 5 failure outcomes per identifier in 15 minutes → 15-minute lockout. */
  lockoutThreshold: 5,
  lockoutSeconds: 900,
  /** MFA step-up: 5 failed challenges per session/user/IP in 15 minutes. */
  mfaPerActor: { max: 5, windowSeconds: 900 } satisfies AbuseRateLimit,
  /** Invitation acceptance: 10 attempts per invitation fingerprint + IP in one hour. */
  invitationPerFingerprint: { max: 10, windowSeconds: 3_600 } satisfies AbuseRateLimit,
  /** Tenant switching: 20 switches per user/session in 10 minutes. */
  switchPerActor: { max: 20, windowSeconds: 600 } satisfies AbuseRateLimit,
} as const;

/** Stable, bounded Redis key fragment for an arbitrary abuse value. */
export function hashAbuseKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

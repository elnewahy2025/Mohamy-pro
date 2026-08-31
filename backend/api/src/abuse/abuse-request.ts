import type { Request } from 'express';

/**
 * Derive the bounded identifiers used by abuse controls from an incoming
 * request. Never returns raw secrets; callers hash the result before use.
 */
export function abuseClientIp(request: Request): string {
  return request.ip?.trim() || 'unknown';
}

/**
 * A normalized, case-folded account identifier observed on an auth request,
 * or null when the request carries none. Used for per-identifier login limits
 * and failed-auth lockout.
 */
export function abuseAccountIdentifier(request: Request): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  if (body && typeof body.username === 'string' && body.username.trim()) {
    return body.username.trim().toLowerCase();
  }
  return null;
}

/**
 * The raw invitation token observed on an invitation-acceptance request, or
 * null. Used as the fingerprint for invitation-rate limiting (hashed before
 * storage; the token itself is never surfaced).
 */
export function abuseInvitationToken(request: Request): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  if (body && typeof body.token === 'string' && body.token) {
    return body.token;
  }
  return null;
}

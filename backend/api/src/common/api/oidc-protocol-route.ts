/**
 * Identifies authentication-protocol routes that are excluded from the
 * business idempotency contract because their state/nonce/PKCE protocol
 * provides the replay boundary.
 */
export function isOidcProtocolRoute(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    /login\/(callback|initiate)|authorize|token|\.well-known/.test(
      normalized,
    ) || /\/api\/v\d+\/auth\/(login|logout)$/.test(normalized)
  );
}

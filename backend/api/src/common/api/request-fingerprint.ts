import { createHash } from 'node:crypto';
import type { Request } from 'express';

/**
 * Computes a canonical request fingerprint as a sha256 hex digest over the
 * normalized method, route, actor scope, tenant scope, content type and body.
 * Key ordering in the body is normalized so identical payloads produce an
 * identical fingerprint regardless of JSON key order.
 */
export function computeFingerprint(
  request: Request,
  actorScope: string | null,
  tenantScope: string | null,
  route: string,
): string {
  const body = request.body ?? {};
  const contentType = request.header('content-type') ?? '';
  const canonicalBody =
    body === null || body === undefined
      ? ''
      : typeof body === 'string'
        ? body
        : stableStringify(body);
  const hash = createHash('sha256');
  hash.update(request.method ?? '');
  hash.update('\u0000');
  hash.update(route ?? '');
  hash.update('\u0000');
  hash.update(actorScope ?? '');
  hash.update('\u0000');
  hash.update(tenantScope ?? '');
  hash.update('\u0000');
  hash.update(contentType);
  hash.update('\u0000');
  hash.update(canonicalBody);
  return hash.digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

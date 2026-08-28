import type { Request } from 'express';
import { computeFingerprint } from './request-fingerprint';

function makeRequest(body: unknown, method = 'POST', route = '/r'): Request {
  const request = {
    method,
    route: { path: route },
    body,
    header: (name: string) =>
      name.toLowerCase() === 'content-type' ? 'application/json' : undefined,
  } as unknown as Request;
  return request;
}

describe('idempotency fingerprint', () => {
  it('is stable regardless of JSON key ordering', () => {
    const a = computeFingerprint(makeRequest({ b: 1, a: 2 }), 'u', 't', '/r');
    const b = computeFingerprint(makeRequest({ a: 2, b: 1 }), 'u', 't', '/r');
    expect(a).toBe(b);
  });

  it('includes actor and tenant scope', () => {
    const a = computeFingerprint(
      makeRequest({ x: 1 }),
      'user-a',
      'tenant-a',
      '/r',
    );
    const b = computeFingerprint(
      makeRequest({ x: 1 }),
      'user-b',
      'tenant-a',
      '/r',
    );
    expect(a).not.toBe(b);
    const c = computeFingerprint(
      makeRequest({ x: 1 }),
      'user-a',
      'tenant-b',
      '/r',
    );
    expect(a).not.toBe(c);
  });

  it('includes the route', () => {
    const a = computeFingerprint(
      makeRequest({ x: 1 }, 'POST', '/a'),
      null,
      null,
      '/a',
    );
    const b = computeFingerprint(
      makeRequest({ x: 1 }, 'POST', '/b'),
      null,
      null,
      '/b',
    );
    expect(a).not.toBe(b);
  });

  it('is a fixed-length sha256 hex digest', () => {
    const fp = computeFingerprint(makeRequest({ x: 1 }), 'u', 't', '/r');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not leak raw values into the fingerprint', () => {
    const fp = computeFingerprint(
      makeRequest({ password: 'super-secret', name: 'x' }),
      'u',
      't',
      '/r',
    );
    expect(fp).not.toContain('super-secret');
  });
});

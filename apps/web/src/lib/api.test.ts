import { describe, expect, it } from 'vitest';
import { ApiClient } from './api';

function okJson(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function enveloped<T>(data: T): unknown {
  return {
    success: true,
    data,
    meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', pagination: null },
  };
}

describe('ApiClient', () => {
  it('sends the session cookie with credentials include on /auth/me', async () => {
    const calls: RequestInit[] = [];
    const fetchMock = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push(init ?? {});
      return okJson(enveloped({ userId: 'u1', activeTenantId: null }));
    };
    const client = new ApiClient('http://localhost:3000/api/v1', fetchMock);

    const user = await client.me();

    expect(user).toEqual({ userId: 'u1', activeTenantId: null });
    expect(calls[0].credentials).toBe('include');
  });

  it('returns null from /auth/me on 401', async () => {
    const fetchMock = async (): Promise<Response> => new Response(null, { status: 401 });
    const client = new ApiClient('http://localhost:3000/api/v1', fetchMock);

    expect(await client.me()).toBeNull();
  });

  it('throws from /auth/me when the 200 envelope data is not a valid AuthUser payload', async () => {
    const fetchMock = async (): Promise<Response> =>
      okJson({ success: true, data: { success: false, error: { code: 'FORBIDDEN' } } });
    const client = new ApiClient('http://localhost:3000/api/v1', fetchMock);

    await expect(client.me()).rejects.toThrow(
      'GET /auth/me returned an invalid AuthUser payload',
    );
  });

  it('sends the X-CSRF-Token on POST /auth/logout', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/auth/csrf')) {
        return okJson(enveloped({ csrfToken: 'csrf-token-1' }));
      }
      return new Response(null, { status: 302 });
    };
    const client = new ApiClient('http://localhost:3000/api/v1', fetchMock);

    await client.logout();

    expect(calls[0].url).toBe('http://localhost:3000/api/v1/auth/csrf');
    const logout = calls[1];
    expect(logout.url).toBe('http://localhost:3000/api/v1/auth/logout');
    expect(logout.init?.method).toBe('POST');
    expect(logout.init?.credentials).toBe('include');
    expect(logout.init?.redirect).toBe('manual');
    expect(
      (logout.init?.headers as Record<string, string>)['X-CSRF-Token'],
    ).toBe('csrf-token-1');
  });

  it('points login at the backend login endpoint', () => {
    const client = new ApiClient('http://localhost:3000/api/v1');
    expect(client.loginUrl()).toBe('http://localhost:3000/api/v1/auth/login');
  });
});

describe('ApiClient business mutations', () => {
  const base = 'http://localhost:3000/api/v1';

  function mutatingFetch(handlers?: Record<string, (url: string, init?: RequestInit) => Response>): {
    fetchMock: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
    calls: Array<{ url: string; init?: RequestInit }>;
  } {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const urlString = String(url);
      calls.push({ url: urlString, init });
      if (urlString.endsWith('/auth/csrf')) {
        return okJson(enveloped({ csrfToken: 'csrf-mutation' }));
      }
      if (handlers) {
        for (const suffix of Object.keys(handlers)) {
          if (urlString.endsWith(suffix)) return handlers[suffix](urlString, init);
        }
      }
      return new Response(null, { status: 404 });
    };
    return { fetchMock, calls };
  }

  it('sends CSRF + Idempotency-Key on POST bootstrap and returns the typed payload', async () => {
    const { fetchMock, calls } = mutatingFetch({
      '/bootstrap': () => okJson(enveloped({ tenantId: 't1', slug: 'acme', name: 'Acme', organizationId: 'o1', membershipId: 'm1' }), { status: 201 }),
    });
    const client = new ApiClient(base, fetchMock);

    const result = await client.bootstrap('secret-1');

    const create = calls.find((c) => c.url.endsWith('/bootstrap'));
    const headers = create?.init?.headers as Record<string, string>;
    expect(create?.init?.method).toBe('POST');
    expect(create?.init?.credentials).toBe('include');
    expect(headers['X-CSRF-Token']).toBe('csrf-mutation');
    expect(headers['Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result).toEqual({ tenantId: 't1', slug: 'acme', name: 'Acme', organizationId: 'o1', membershipId: 'm1' });
  });

  it('posts tenant-switch with the tenant id and returns a typed payload', async () => {
    const { fetchMock, calls } = mutatingFetch({
      '/session/tenant-switch': () => okJson(enveloped({ tenantId: 't2', slug: 'beta', name: 'Beta', membershipId: 'm2' })),
    });
    const client = new ApiClient(base, fetchMock);

    const result = await client.tenantSwitch('t2');

    const call = calls.find((c) => c.url.endsWith('/session/tenant-switch'));
    expect(JSON.parse(String(call?.init?.body))).toEqual({ tenantId: 't2' });
    expect(result).toEqual({ tenantId: 't2', slug: 'beta', name: 'Beta', membershipId: 'm2' });
  });

  it('maps a backend error envelope to an ApiError with code and details', async () => {
    const { fetchMock } = mutatingFetch({
      '/membership/invitations': () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'VALIDATION_FAILED', message: 'The provided input is invalid.', details: ['requestedRoleKeys must be an array'] },
            meta: { requestId: 'req-x', timestamp: '2026-01-01T00:00:00.000Z' },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    const client = new ApiClient(base, fetchMock);

    await expect(client.createInvitation({ requestedRoleKeys: [] })).rejects.toMatchObject({
      name: 'ApiError',
      code: 'VALIDATION_FAILED',
      details: ['requestedRoleKeys must be an array'],
      status: 400,
      requestId: 'req-x',
    });
  });

  it('patches membership suspend with CSRF + idempotency', async () => {
    const { fetchMock, calls } = mutatingFetch({
      '/membership/members/suspend': () => okJson(enveloped({ membershipId: 'm1', tenantId: 't1', status: 'SUSPENDED' })),
    });
    const client = new ApiClient(base, fetchMock);

    const result = await client.suspendMembership({ membershipId: 'm1', reason: 'abuse' });

    const call = calls.find((c) => c.url.endsWith('/membership/members/suspend'));
    expect(call?.init?.method).toBe('PATCH');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ membershipId: 'm1', reason: 'abuse' });
    expect((call?.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-mutation');
    expect(result).toEqual({ membershipId: 'm1', tenantId: 't1', status: 'SUSPENDED' });
  });

  it('accepts an invitation by token and returns the accepted membership', async () => {
    const { fetchMock, calls } = mutatingFetch({
      '/membership/invitations/accept': () => okJson(enveloped({ membershipId: 'm9', tenantId: 't9', status: 'ACTIVE', userId: 'u9' })),
    });
    const client = new ApiClient(base, fetchMock);

    const result = await client.acceptInvitation('abc');

    const call = calls.find((c) => c.url.endsWith('/membership/invitations/accept'));
    expect(JSON.parse(String(call?.init?.body))).toEqual({ token: 'abc' });
    expect(result.status).toBe('ACTIVE');
  });
});

import { describe, expect, it } from 'vitest';
import { ApiClient, ClientsClient, ConflictChecksClient, PartyClient } from './api';

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

describe('ClientsClient (Phase 5)', () => {
  const base = 'http://localhost:3000/api/v1';

  function clientWith(handlers: Record<string, (url: string, init?: RequestInit) => Response>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const urlString = String(url);
      calls.push({ url: urlString, init });
      if (urlString.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-clients' },
            meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', pagination: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      for (const suffix of Object.keys(handlers)) {
        if (urlString.endsWith(suffix)) return handlers[suffix](urlString, init);
      }
      return new Response(null, { status: 404 });
    };
    return { fetchMock, calls };
  }

  function enveloped<T>(data: T, status = 200): Response {
    return new Response(
      JSON.stringify({
        success: true,
        data,
        meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', pagination: null },
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const baseClient = {
    id: 'c1',
    tenantId: 't1',
    clientType: 'INDIVIDUAL',
    name: 'Ahmed Hassan',
    legalName: null,
    displayName: 'Ahmed Hassan',
    status: 'ACTIVE',
    source: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as const;

  it('creates a client via POST /clients', async () => {
    const { fetchMock, calls } = clientWith({
      '/clients': () => enveloped(baseClient, 201),
    });
    const client = new ClientsClient(new ApiClient(base, fetchMock));

    const result = await client.createClient({ clientType: 'INDIVIDUAL', name: 'Ahmed Hassan' });

    const call = calls.find((c) => c.url.endsWith('/clients'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ clientType: 'INDIVIDUAL', name: 'Ahmed Hassan' });
    expect(result.displayName).toBe('Ahmed Hassan');
  });

  it('lists clients with query params on GET /clients', async () => {
    const { fetchMock, calls } = clientWith({
      'clientType=INDIVIDUAL': () =>
        enveloped({ data: [baseClient], pagination: { page: 1, limit: 20, total: 1 } }),
    });
    const client = new ClientsClient(new ApiClient(base, fetchMock));

    const result = await client.listClients({ page: 1, limit: 20, search: 'Ahmed', status: 'ACTIVE', clientType: 'INDIVIDUAL' });

    const call = calls.find((c) => c.url.includes('/clients?'));
    expect(String(call?.url)).toContain('page=1');
    expect(String(call?.url)).toContain('search=Ahmed');
    expect(String(call?.url)).toContain('status=ACTIVE');
    expect(String(call?.url)).toContain('clientType=INDIVIDUAL');
    expect(result.pagination.total).toBe(1);
  });

  it('updates a client via PATCH /clients/:id', async () => {
    const { fetchMock, calls } = clientWith({
      '/clients/c1': () => enveloped({ ...baseClient, name: 'Updated' }),
    });
    const client = new ClientsClient(new ApiClient(base, fetchMock));

    const result = await client.updateClient({ id: 'c1', name: 'Updated' });

    const call = calls.find((c) => c.url.endsWith('/clients/c1'));
    expect(call?.init?.method).toBe('PATCH');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ id: 'c1', name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('archives a client via DELETE /clients/:id with a reason', async () => {
    const { fetchMock, calls } = clientWith({
      '/clients/c1': () => enveloped({ ...baseClient, status: 'ARCHIVED' }),
    });
    const client = new ClientsClient(new ApiClient(base, fetchMock));

    await client.archiveClient({ id: 'c1', reason: 'duplicate' });

    const call = calls.find((c) => c.url.endsWith('/clients/c1'));
    expect(call?.init?.method).toBe('DELETE');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ reason: 'duplicate' });
  });

  it('creates a contact under clients/:clientId/contacts', async () => {
    const { fetchMock, calls } = clientWith({
      '/clients/c1/contacts': () =>
        enveloped({ id: 'k1', tenantId: 't1', clientId: 'c1', type: 'EMAIL', value: 'a@b.com', label: null, isPrimary: true }),
    });
    const client = new ClientsClient(new ApiClient(base, fetchMock));

    const result = await client.createContact({ clientId: 'c1', type: 'EMAIL', value: 'a@b.com', isPrimary: true });

    const call = calls.find((c) => c.url.endsWith('/clients/c1/contacts'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ clientId: 'c1', type: 'EMAIL', value: 'a@b.com', isPrimary: true });
    expect(result.isPrimary).toBe(true);
  });

  it('removes an address via DELETE clients/:clientId/addresses/:id', async () => {
    const { fetchMock, calls } = clientWith({
      '/clients/c1/addresses/a1': () => enveloped({ ok: true }),
    });
    const client = new ClientsClient(new ApiClient(base, fetchMock));

    await client.removeAddress({ clientId: 'c1', id: 'a1', reason: 'moved' });

    const call = calls.find((c) => c.url.endsWith('/clients/c1/addresses/a1'));
    expect(call?.init?.method).toBe('DELETE');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ reason: 'moved' });
  });
});

describe('ConflictChecksClient (Phase 6)', () => {
  const base = 'http://localhost:3000/api/v1';

  function clientWith(handlers: Record<string, (url: string, init?: RequestInit) => Response>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const urlString = String(url);
      calls.push({ url: urlString, init });
      if (urlString.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-conflict' },
            meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', pagination: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      for (const suffix of Object.keys(handlers)) {
        if (urlString.endsWith(suffix)) return handlers[suffix](urlString, init);
      }
      return new Response(null, { status: 404 });
    };
    return { fetchMock, calls };
  }

  function enveloped<T>(data: T, status = 200): Response {
    return new Response(
      JSON.stringify({
        success: true,
        data,
        meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', pagination: null },
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const baseCheck = {
    id: 'x1',
    tenantId: 't1',
    status: 'PENDING',
    requesterUserId: 'u1',
    clientId: null,
    decision: 'PENDING',
    reason: null,
    reviewerUserId: null,
    reviewedAt: null,
    matchSummary: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    parties: [
      {
        id: 'p1',
        tenantId: 't1',
        kind: 'PARTY',
        name: 'Acme Corp',
        normalizedName: 'acme corp',
        email: 'legal@acme.com',
      },
    ],
  } as const;

  it('requests a conflict check via POST /conflict-checks', async () => {
    const { fetchMock, calls } = clientWith({
      '/conflict-checks': () => enveloped(baseCheck, 201),
    });
    const client = new ConflictChecksClient(new ApiClient(base, fetchMock));

    const result = await client.request({
      clientId: null,
      parties: [{ kind: 'PARTY', name: 'Acme Corp', email: 'legal@acme.com' }],
    });

    const call = calls.find((c) => c.url.endsWith('/conflict-checks'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      clientId: null,
      parties: [{ kind: 'PARTY', name: 'Acme Corp', email: 'legal@acme.com' }],
    });
    expect(result.id).toBe('x1');
  });

  it('lists conflict checks with query params on GET /conflict-checks', async () => {
    const { fetchMock, calls } = clientWith({
      'status=PENDING': () =>
        enveloped({
          data: [
            {
              id: 'x1',
              tenantId: 't1',
              status: 'PENDING',
              requesterUserId: 'u1',
              clientId: null,
              decision: 'PENDING',
              reviewerUserId: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              partyCount: 1,
            },
          ],
          pagination: { page: 1, limit: 20, total: 1 },
        }),
    });
    const client = new ConflictChecksClient(new ApiClient(base, fetchMock));

    const result = await client.list({ page: 1, limit: 20, status: 'PENDING' });

    const call = calls.find((c) => c.url.includes('/conflict-checks?'));
    expect(String(call?.url)).toContain('page=1');
    expect(String(call?.url)).toContain('limit=20');
    expect(String(call?.url)).toContain('status=PENDING');
    expect(result.pagination.total).toBe(1);
  });

  it('gets a single conflict check via GET /conflict-checks/:id', async () => {
    const { fetchMock, calls } = clientWith({
      '/conflict-checks/x1': () => enveloped(baseCheck),
    });
    const client = new ConflictChecksClient(new ApiClient(base, fetchMock));

    const result = await client.get('x1');

    const call = calls.find((c) => c.url.endsWith('/conflict-checks/x1'));
    expect(call?.init?.method).toBe('GET');
    expect(result.parties).toHaveLength(1);
  });

  it('starts review via POST /conflict-checks/:id/review', async () => {
    const { fetchMock, calls } = clientWith({
      '/conflict-checks/x1/review': () =>
        enveloped({ ...baseCheck, status: 'IN_REVIEW' }),
    });
    const client = new ConflictChecksClient(new ApiClient(base, fetchMock));

    const result = await client.startReview({ id: 'x1' });

    const call = calls.find((c) => c.url.endsWith('/conflict-checks/x1/review'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({});
    expect(result.status).toBe('IN_REVIEW');
  });

  it('records a decision via POST /conflict-checks/:id/decide', async () => {
    const { fetchMock, calls } = clientWith({
      '/conflict-checks/x1/decide': () =>
        enveloped({ ...baseCheck, status: 'COMPLETED', decision: 'ALLOW', reviewerUserId: 'u1' }),
    });
    const client = new ConflictChecksClient(new ApiClient(base, fetchMock));

    const result = await client.decide({ id: 'x1', decision: 'ALLOW', reason: 'no overlap' });

    const call = calls.find((c) => c.url.endsWith('/conflict-checks/x1/decide'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ decision: 'ALLOW', reason: 'no overlap' });
    expect(result.decision).toBe('ALLOW');
  });
});

describe('PartyClient (Phase 7)', () => {
  const base = 'http://localhost:3000/api/v1';

  function clientWith(handlers: Record<string, (url: string, init?: RequestInit) => Response>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const urlString = String(url);
      calls.push({ url: urlString, init });
      if (urlString.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-party' },
            meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', pagination: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      for (const suffix of Object.keys(handlers)) {
        if (urlString.endsWith(suffix)) return handlers[suffix](urlString, init);
      }
      return new Response(null, { status: 404 });
    };
    return { fetchMock, calls };
  }

  function enveloped<T>(data: T, status = 200): Response {
    return new Response(
      JSON.stringify({
        success: true,
        data,
        meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z', pagination: null },
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const baseParty = {
    id: 'p1',
    tenantId: 't1',
    partyType: 'PERSON',
    name: 'Ahmed Hassan',
    legalName: null,
    displayName: 'Ahmed Hassan',
    status: 'ACTIVE',
    clientId: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as const;

  it('creates a party via POST /parties', async () => {
    const { fetchMock, calls } = clientWith({
      '/parties': () => enveloped(baseParty, 201),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    const result = await client.create({ partyType: 'PERSON', name: 'Ahmed Hassan', displayName: 'Ahmed Hassan' });

    const call = calls.find((c) => c.url.endsWith('/parties'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      partyType: 'PERSON',
      name: 'Ahmed Hassan',
      displayName: 'Ahmed Hassan',
    });
    expect(result.displayName).toBe('Ahmed Hassan');
  });

  it('lists parties with query params on GET /parties', async () => {
    const { fetchMock, calls } = clientWith({
      'partyType=PERSON': () =>
        enveloped({ data: [baseParty], pagination: { page: 1, limit: 20, total: 1 } }),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    const result = await client.list({ page: 1, limit: 20, search: 'Ahmed', status: 'ACTIVE', partyType: 'PERSON' });

    const call = calls.find((c) => c.url.includes('/parties?'));
    expect(String(call?.url)).toContain('page=1');
    expect(String(call?.url)).toContain('search=Ahmed');
    expect(String(call?.url)).toContain('status=ACTIVE');
    expect(String(call?.url)).toContain('partyType=PERSON');
    expect(result.pagination.total).toBe(1);
  });

  it('gets a single party via GET /parties/:id', async () => {
    const { fetchMock, calls } = clientWith({
      '/parties/p1': () => enveloped(baseParty),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    const result = await client.get('p1');

    const call = calls.find((c) => c.url.endsWith('/parties/p1'));
    expect(call?.init?.method).toBe('GET');
    expect(result.id).toBe('p1');
  });

  it('updates a party via PATCH /parties/:id', async () => {
    const { fetchMock, calls } = clientWith({
      '/parties/p1': () => enveloped({ ...baseParty, displayName: 'Updated' }),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    const result = await client.update({ id: 'p1', displayName: 'Updated' });

    const call = calls.find((c) => c.url.endsWith('/parties/p1'));
    expect(call?.init?.method).toBe('PATCH');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ id: 'p1', displayName: 'Updated' });
    expect(result.displayName).toBe('Updated');
  });

  it('archives a party via DELETE /parties/:id with a reason', async () => {
    const { fetchMock, calls } = clientWith({
      '/parties/p1': () => enveloped({ ...baseParty, status: 'ARCHIVED' }),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    await client.archive({ id: 'p1', reason: 'duplicate' });

    const call = calls.find((c) => c.url.endsWith('/parties/p1'));
    expect(call?.init?.method).toBe('DELETE');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ reason: 'duplicate' });
  });

  it('lists the party role catalog via GET /parties/roles', async () => {
    const { fetchMock, calls } = clientWith({
      '/parties/roles': () =>
        enveloped([
          { id: 'r1', tenantId: 't1', key: 'plaintiff', label: 'Plaintiff', status: 'ACTIVE' },
        ]),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    const result = await client.listRoles();

    const call = calls.find((c) => c.url.endsWith('/parties/roles'));
    expect(call?.init?.method).toBe('GET');
    expect(result[0].key).toBe('plaintiff');
  });

  it('creates a relationship via POST /parties/:id/relationships', async () => {
    const { fetchMock, calls } = clientWith({
      '/parties/p1/relationships': () =>
        enveloped({ id: 'rel1', tenantId: 't1', fromPartyId: 'p1', toPartyId: 'p2', relationshipType: 'spouse', status: 'ACTIVE' }, 201),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    const result = await client.createRelationship({ fromPartyId: 'p1', toPartyId: 'p2', relationshipType: 'spouse' });

    const call = calls.find((c) => c.url.endsWith('/parties/p1/relationships'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ toPartyId: 'p2', relationshipType: 'spouse' });
    expect(result.relationshipType).toBe('spouse');
  });

  it('lists relationships via GET /parties/:id/relationships', async () => {
    const { fetchMock, calls } = clientWith({
      'relationships?page=1&limit=20': () =>
        enveloped({
          data: [
            {
              id: 'rel1',
              tenantId: 't1',
              fromPartyId: 'p1',
              toPartyId: 'p2',
              relationshipType: 'spouse',
              status: 'ACTIVE',
              toParty: { id: 'p2', displayName: 'Fatima', partyType: 'PERSON' },
            },
          ],
          pagination: { page: 1, limit: 20, total: 1 },
        }),
    });
    const client = new PartyClient(new ApiClient(base, fetchMock));

    const result = await client.listRelationships('p1', { page: 1, limit: 20 });

    const call = calls.find((c) => c.url.includes('/parties/p1/relationships?'));
    expect(String(call?.url)).toContain('page=1');
    expect(String(call?.url)).toContain('limit=20');
    expect(result.data[0].toParty?.displayName).toBe('Fatima');
  });
});

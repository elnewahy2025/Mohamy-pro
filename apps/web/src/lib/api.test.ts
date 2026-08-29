import { describe, expect, it } from 'vitest';
import { ApiClient } from './api';

function okJson(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('ApiClient', () => {
  it('sends the session cookie with credentials include on /auth/me', async () => {
    const calls: RequestInit[] = [];
    const fetchMock = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push(init ?? {});
      return okJson({ userId: 'u1', activeTenantId: null });
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

  it('sends the X-CSRF-Token on POST /auth/logout', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/auth/csrf')) {
        return okJson({ csrfToken: 'csrf-token-1' });
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

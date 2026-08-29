// Cross-origin API client for the Mohamy Pro backend.
// Sole responsibility: issue credentialed, typed requests to /api/v1/auth
// without leaking cookies or CSRF handling into the app shell.

export interface AuthUser {
  userId: string;
  activeTenantId: string | null;
}

export interface CsrfToken {
  csrfToken: string;
}

export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export const API_V1_URL = `${API_BASE_URL}/api/v1`;

export class ApiClient {
  constructor(
    private readonly baseUrl: string = API_V1_URL,
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  private jsonHeaders(): Record<string, string> {
    return { Accept: 'application/json' };
  }

  async me(): Promise<AuthUser | null> {
    const res = await this.fetcher(`${this.baseUrl}/auth/me`, {
      credentials: 'include',
      headers: this.jsonHeaders(),
    });
    console.log('[ApiClient.me] status:', res.status);
    if (res.status === 401) {
      console.log('[ApiClient.me] returning null because status is 401');
      return null;
    }
    if (!res.ok) {
      throw new Error(`GET /auth/me failed with ${res.status}`);
    }
    const body: unknown = await res.json();
    console.log('[ApiClient.me] parsed JSON:', body, '| type:', typeof body);
    if (
      body === null ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>).userId !== 'string'
    ) {
      throw new Error('GET /auth/me returned an invalid AuthUser payload');
    }
    return body as AuthUser;
  }

  async csrfToken(): Promise<string> {
    const res = await this.fetcher(`${this.baseUrl}/auth/csrf`, {
      credentials: 'include',
      headers: this.jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(`GET /auth/csrf failed with ${res.status}`);
    }
    const body = (await res.json()) as CsrfToken;
    return body.csrfToken;
  }

  loginUrl(): string {
    return `${this.baseUrl}/auth/login`;
  }

  async logout(): Promise<void> {
    const token = await this.csrfToken();
    await this.fetcher(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
    });
  }
}

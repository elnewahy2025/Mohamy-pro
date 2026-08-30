// Cross-origin API client for the Mohamy Pro backend.
// Sole responsibility: issue credentialed, typed requests to /api/v1/auth
// without leaking cookies or CSRF handling into the app shell.

export interface AuthUser {
  userId: string;
  username: string | null;
  activeTenantId: string | null;
}

export interface CsrfToken {
  csrfToken: string;
}

export interface SuccessEnvelope<T> {
  success: boolean;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    pagination: unknown;
  };
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
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`GET /auth/me failed with ${res.status}`);
    }
    const envelope = (await res.json()) as SuccessEnvelope<unknown>;
    const data = envelope?.data;
    if (
      data === null ||
      typeof data !== 'object' ||
      typeof (data as Record<string, unknown>).userId !== 'string'
    ) {
      throw new Error('GET /auth/me returned an invalid AuthUser payload');
    }
    return data as AuthUser;
  }

  async csrfToken(): Promise<string> {
    const res = await this.fetcher(`${this.baseUrl}/auth/csrf`, {
      credentials: 'include',
      headers: this.jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(`GET /auth/csrf failed with ${res.status}`);
    }
    const envelope = (await res.json()) as SuccessEnvelope<CsrfToken>;
    if (
      !envelope?.data ||
      typeof envelope.data.csrfToken !== 'string'
    ) {
      throw new Error('GET /auth/csrf returned an invalid CSRF payload');
    }
    return envelope.data.csrfToken;
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

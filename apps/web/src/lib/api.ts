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

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details: string[];
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface BootstrapResult {
  tenantId: string;
  slug: string;
  name: string;
  organizationId: string;
  membershipId: string;
}

export interface TenantSwitchResult {
  tenantId: string;
  slug: string;
  name: string;
  membershipId: string;
}

export interface InvitationCreateResult {
  invitationId: string;
  token: string;
  tenantId: string;
  expiresAt: string;
}

export interface InvitationAcceptResult {
  membershipId: string;
  tenantId: string;
  status: string;
  userId: string;
}

export interface MembershipAdminResult {
  membershipId: string;
  tenantId: string;
  status: string;
}

export interface InvitationCreateRequest {
  intendedEmail?: string;
  intendedProviderSubject?: string;
  requestedRoleKeys: string[];
  requestedScope?: {
    organizationId?: string;
    branchId?: string;
    departmentId?: string;
    teamId?: string;
  } | null;
}

export interface MembershipAdminRequest {
  membershipId: string;
  reason?: string;
  activeUntil?: string;
}

export interface MembershipReinstateRequest {
  membershipId: string;
  activeFrom?: string;
  activeUntil?: string;
  reason?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: string[],
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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

  private async parseEnvelope(
    res: Response,
    prefix: string,
  ): Promise<SuccessEnvelope<unknown> | ErrorEnvelope> {
    try {
      return (await res.json()) as SuccessEnvelope<unknown> | ErrorEnvelope;
    } catch {
      throw new ApiError(`${prefix} with ${res.status}`, 'HTTP_ERROR', [], res.status);
    }
  }

  private idempotencyKey(): string {
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      throw new ApiError(
        'The browser environment does not provide crypto.randomUUID',
        'ENV_UNSUPPORTED',
        [],
        0,
      );
    }
    return crypto.randomUUID();
  }

  private async body<T>(
    path: string,
    method: string,
    payload: unknown,
  ): Promise<T> {
    const token = await this.csrfToken();
    const res = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
        'Idempotency-Key': this.idempotencyKey(),
      },
      body: JSON.stringify(payload),
    });
    const envelope = await this.parseEnvelope(res, `${method} ${path}`);
    if (!res.ok) {
      const isError = !envelope.success || 'error' in envelope;
      throw new ApiError(
        isError && 'error' in envelope
          ? envelope.error.message
          : `${method} ${path} failed with ${res.status}`,
        'error' in envelope && !envelope.success
          ? envelope.error.code
          : 'UNKNOWN',
        'error' in envelope && !envelope.success ? envelope.error.details : [],
        res.status,
        'error' in envelope && !envelope.success
          ? envelope.meta.requestId
          : undefined,
      );
    }
    if (!envelope.success || !('data' in envelope)) {
      throw new ApiError(`${method} ${path} returned an invalid envelope`, 'INVALID_ENVELOPE', [], res.status);
    }
    return envelope.data as T;
  }

  async bootstrap(secret: string): Promise<BootstrapResult> {
    return this.body<BootstrapResult>('/bootstrap', 'POST', { secret });
  }

  async tenantSwitch(tenantId: string): Promise<TenantSwitchResult> {
    return this.body<TenantSwitchResult>('/session/tenant-switch', 'POST', {
      tenantId,
    });
  }

  async createInvitation(
    request: InvitationCreateRequest,
  ): Promise<InvitationCreateResult> {
    return this.body<InvitationCreateResult>(
      '/membership/invitations',
      'POST',
      request,
    );
  }

  async acceptInvitation(token: string): Promise<InvitationAcceptResult> {
    return this.body<InvitationAcceptResult>(
      '/membership/invitations/accept',
      'POST',
      { token },
    );
  }

  async suspendMembership(
    request: MembershipAdminRequest,
  ): Promise<MembershipAdminResult> {
    return this.body<MembershipAdminResult>(
      '/membership/members/suspend',
      'PATCH',
      request,
    );
  }

  async expireMembership(
    request: MembershipAdminRequest,
  ): Promise<MembershipAdminResult> {
    return this.body<MembershipAdminResult>(
      '/membership/members/expire',
      'PATCH',
      request,
    );
  }

  async removeMembership(
    request: MembershipAdminRequest,
  ): Promise<MembershipAdminResult> {
    return this.body<MembershipAdminResult>(
      '/membership/members/remove',
      'PATCH',
      request,
    );
  }

  async reinstateMembership(
    request: MembershipReinstateRequest,
  ): Promise<MembershipAdminResult> {
    return this.body<MembershipAdminResult>(
      '/membership/members/reinstate',
      'PATCH',
      request,
    );
  }
}

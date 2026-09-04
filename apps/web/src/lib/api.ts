// Cross-origin API client for the Mohamy Pro backend.
// Sole responsibility: issue credentialed, typed requests to /api/v1/auth
// without leaking cookies or CSRF handling into the app shell.

export interface AuthUser {
  userId: string;
  username: string | null;
  activeTenantId: string | null;
  activeTenantName?: string;
  activeTenantSlug?: string;
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
  process.env.NEXT_PUBLIC_API_BASE_URL ?? (typeof window === 'undefined' ? 'http://127.0.0.1:3000' : '');

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

  async body<T>(
    path: string,
    method: string,
    payload?: unknown,
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

// -----------------------------------------------------------------------------
// Organization Configuration (Phase 4)
// -----------------------------------------------------------------------------

export type HierarchyStatus = 'ACTIVE' | 'ARCHIVED';

export interface OrganizationResult {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: HierarchyStatus;
}

export interface BranchResult {
  id: string;
  tenantId: string;
  organizationId: string;
  slug: string;
  name: string;
  status: HierarchyStatus;
}

export interface DepartmentResult {
  id: string;
  tenantId: string;
  branchId: string;
  slug: string;
  name: string;
  status: HierarchyStatus;
}

export interface TeamResult {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  status: HierarchyStatus;
}

export interface CreateOrganizationRequest {
  slug: string;
  name: string;
}

export interface UpdateOrganizationRequest {
  id: string;
  slug?: string;
  name?: string;
}

export interface ArchiveOrganizationRequest {
  id: string;
  reason?: string;
}

export interface CreateBranchRequest {
  organizationId: string;
  slug: string;
  name: string;
}

export interface UpdateBranchRequest {
  id: string;
  slug?: string;
  name?: string;
}

export interface ArchiveBranchRequest {
  id: string;
  reason?: string;
}

export interface CreateDepartmentRequest {
  branchId: string;
  slug: string;
  name: string;
}

export interface UpdateDepartmentRequest {
  id: string;
  slug?: string;
  name?: string;
}

export interface ArchiveDepartmentRequest {
  id: string;
  reason?: string;
}

export interface CreateTeamRequest {
  slug: string;
  name: string;
  description?: string | null;
}

export interface UpdateTeamRequest {
  id: string;
  slug?: string;
  name?: string;
  description?: string | null;
}

export interface ArchiveTeamRequest {
  id: string;
  reason?: string;
}

export interface OrganizationSetting {
  tenantId: string;
  key: string;
  value: unknown;
  version: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface OrganizationSettingList {
  data: OrganizationSetting[];
  pagination: PaginationMeta;
}

export interface SetOrganizationSettingResult {
  id: string;
  tenantId: string;
  key: string;
  version: number;
  created: boolean;
}

export interface ListSettingsQuery {
  page?: number;
  limit?: number;
}

export interface SetOrganizationSettingRequest {
  value: unknown;
}

const ORG_PREFIX = '/organization-config';

export class OrgConfigClient {
  constructor(private readonly client = new ApiClient()) {}

  // Organizations
  createOrganization(req: CreateOrganizationRequest): Promise<OrganizationResult> {
    return this.client.body<OrganizationResult>(`${ORG_PREFIX}/organizations`, 'POST', req);
  }
  updateOrganization(req: UpdateOrganizationRequest): Promise<OrganizationResult> {
    return this.client.body<OrganizationResult>(`${ORG_PREFIX}/organizations`, 'PATCH', req);
  }
  archiveOrganization(req: ArchiveOrganizationRequest): Promise<OrganizationResult> {
    return this.client.body<OrganizationResult>(`${ORG_PREFIX}/organizations/archive`, 'PATCH', req);
  }

  // Branches
  createBranch(req: CreateBranchRequest): Promise<BranchResult> {
    return this.client.body<BranchResult>(`${ORG_PREFIX}/branches`, 'POST', req);
  }
  updateBranch(req: UpdateBranchRequest): Promise<BranchResult> {
    return this.client.body<BranchResult>(`${ORG_PREFIX}/branches`, 'PATCH', req);
  }
  archiveBranch(req: ArchiveBranchRequest): Promise<BranchResult> {
    return this.client.body<BranchResult>(`${ORG_PREFIX}/branches/archive`, 'PATCH', req);
  }

  // Departments
  createDepartment(req: CreateDepartmentRequest): Promise<DepartmentResult> {
    return this.client.body<DepartmentResult>(`${ORG_PREFIX}/departments`, 'POST', req);
  }
  updateDepartment(req: UpdateDepartmentRequest): Promise<DepartmentResult> {
    return this.client.body<DepartmentResult>(`${ORG_PREFIX}/departments`, 'PATCH', req);
  }
  archiveDepartment(req: ArchiveDepartmentRequest): Promise<DepartmentResult> {
    return this.client.body<DepartmentResult>(`${ORG_PREFIX}/departments/archive`, 'PATCH', req);
  }

  // Teams
  createTeam(req: CreateTeamRequest): Promise<TeamResult> {
    return this.client.body<TeamResult>(`${ORG_PREFIX}/teams`, 'POST', req);
  }
  updateTeam(req: UpdateTeamRequest): Promise<TeamResult> {
    return this.client.body<TeamResult>(`${ORG_PREFIX}/teams`, 'PATCH', req);
  }
  archiveTeam(req: ArchiveTeamRequest): Promise<TeamResult> {
    return this.client.body<TeamResult>(`${ORG_PREFIX}/teams/archive`, 'PATCH', req);
  }

  // Settings
  listSettings(query: ListSettingsQuery = {}): Promise<OrganizationSettingList> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.client.body<OrganizationSettingList>(
      `${ORG_PREFIX}/settings${qs ? `?${qs}` : ''}`,
      'GET',
    );
  }
  getSetting(key: string): Promise<OrganizationSetting | null> {
    return this.client.body<OrganizationSetting | null>(
      `${ORG_PREFIX}/settings/${encodeURIComponent(key)}`,
      'GET',
    );
  }
  setSetting(key: string, value: unknown): Promise<SetOrganizationSettingResult> {
    return this.client.body<SetOrganizationSettingResult>(
      `${ORG_PREFIX}/settings/${encodeURIComponent(key)}`,
      'PUT',
      { value },
    );
  }
}

// -----------------------------------------------------------------------------
// Client Management (Phase 5)
// -----------------------------------------------------------------------------

export type ClientType = 'INDIVIDUAL' | 'ORGANIZATION';
export type ClientStatus = 'ACTIVE' | 'ARCHIVED';
export type ContactType = 'PHONE' | 'EMAIL' | 'FAX' | 'WEBSITE' | 'MOBILE';
export type AddressType = 'MAILING' | 'BILLING' | 'REGISTERED' | 'BRANCH';

export interface ClientResult {
  id: string;
  tenantId: string;
  clientType: ClientType;
  name: string;
  legalName: string | null;
  displayName: string;
  status: ClientStatus;
  source: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContactResult {
  id: string;
  tenantId: string;
  clientId: string;
  type: ContactType;
  value: string;
  label: string | null;
  isPrimary: boolean;
}

export interface ClientAddressResult {
  id: string;
  tenantId: string;
  clientId: string;
  type: AddressType;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  isPrimary: boolean;
}

export interface ClientListResult {
  data: ClientResult[];
  pagination: PaginationMeta;
}

export interface CreateClientRequest {
  clientType: ClientType;
  name: string;
  legalName?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface UpdateClientRequest {
  id: string;
  name?: string;
  legalName?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface ArchiveClientRequest {
  id: string;
  reason?: string;
}

export interface ListClientsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ClientStatus;
  clientType?: ClientType;
}

export interface CreateClientContactRequest {
  clientId: string;
  type: ContactType;
  value: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface UpdateClientContactRequest {
  id: string;
  clientId: string;
  value?: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface RemoveClientContactRequest {
  id: string;
  clientId: string;
  reason?: string;
}

export interface CreateClientAddressRequest {
  clientId: string;
  type: AddressType;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  country: string;
  isPrimary?: boolean;
}

export interface UpdateClientAddressRequest {
  id: string;
  clientId: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  region?: string | null;
  postalCode?: string | null;
  country?: string;
  isPrimary?: boolean;
}

export interface RemoveClientAddressRequest {
  id: string;
  clientId: string;
  reason?: string;
}

const CLIENTS_PREFIX = '/clients';

export class ClientsClient {
  constructor(private readonly client = new ApiClient()) {}

  // Clients
  createClient(req: CreateClientRequest): Promise<ClientResult> {
    return this.client.body<ClientResult>(CLIENTS_PREFIX, 'POST', req);
  }
  listClients(query: ListClientsQuery = {}): Promise<ClientListResult> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    if (query.clientType) params.set('clientType', query.clientType);
    const qs = params.toString();
    return this.client.body<ClientListResult>(
      `${CLIENTS_PREFIX}${qs ? `?${qs}` : ''}`,
      'GET',
    );
  }
  getClient(id: string): Promise<ClientResult> {
    return this.client.body<ClientResult>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(id)}`,
      'GET',
    );
  }
  updateClient(req: UpdateClientRequest): Promise<ClientResult> {
    return this.client.body<ClientResult>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.id)}`,
      'PATCH',
      req,
    );
  }
  archiveClient(req: ArchiveClientRequest): Promise<ClientResult> {
    return this.client.body<ClientResult>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.id)}`,
      'DELETE',
      { reason: req.reason ?? undefined },
    );
  }

  // Contacts
  createContact(req: CreateClientContactRequest): Promise<ClientContactResult> {
    return this.client.body<ClientContactResult>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.clientId)}/contacts`,
      'POST',
      req,
    );
  }
  updateContact(req: UpdateClientContactRequest): Promise<ClientContactResult> {
    return this.client.body<ClientContactResult>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.clientId)}/contacts/${encodeURIComponent(req.id)}`,
      'PATCH',
      req,
    );
  }
  removeContact(req: RemoveClientContactRequest): Promise<void> {
    return this.client.body<void>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.clientId)}/contacts/${encodeURIComponent(req.id)}`,
      'DELETE',
      { reason: req.reason ?? undefined },
    );
  }

  // Addresses
  createAddress(req: CreateClientAddressRequest): Promise<ClientAddressResult> {
    return this.client.body<ClientAddressResult>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.clientId)}/addresses`,
      'POST',
      req,
    );
  }
  updateAddress(req: UpdateClientAddressRequest): Promise<ClientAddressResult> {
    return this.client.body<ClientAddressResult>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.clientId)}/addresses/${encodeURIComponent(req.id)}`,
      'PATCH',
      req,
    );
  }
  removeAddress(req: RemoveClientAddressRequest): Promise<void> {
    return this.client.body<void>(
      `${CLIENTS_PREFIX}/${encodeURIComponent(req.clientId)}/addresses/${encodeURIComponent(req.id)}`,
      'DELETE',
      { reason: req.reason ?? undefined },
    );
  }
}

export type ConflictCheckStatus = 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
export type ConflictDecision = 'PENDING' | 'ALLOW' | 'BLOCK';
export type ConflictPartyKind = 'PARTY' | 'RELATED_ENTITY';

export interface ConflictPartyResult {
  id: string;
  tenantId: string;
  kind: ConflictPartyKind;
  name: string;
  normalizedName: string;
  email: string | null;
}

export interface ConflictMatchResult {
  partyName: string;
  normalized: string;
  matchedClientIds: string[];
  reasons: string[];
}

export interface ConflictCheckResult {
  id: string;
  tenantId: string;
  status: ConflictCheckStatus;
  requesterUserId: string;
  clientId: string | null;
  decision: ConflictDecision;
  reason: string | null;
  reviewerUserId: string | null;
  reviewedAt: string | null;
  matchSummary: ConflictMatchResult[] | null;
  createdAt: string;
  updatedAt: string;
  parties: ConflictPartyResult[];
}

export interface ConflictCheckListRow {
  id: string;
  tenantId: string;
  status: ConflictCheckStatus;
  requesterUserId: string;
  clientId: string | null;
  decision: ConflictDecision;
  reviewerUserId: string | null;
  createdAt: string;
  updatedAt: string;
  partyCount: number;
}

export interface ConflictCheckListResult {
  data: ConflictCheckListRow[];
  pagination: PaginationMeta;
}

export interface CreateConflictCheckRequest {
  clientId?: string | null;
  parties: Array<{
    kind: ConflictPartyKind;
    name: string;
    email?: string | null;
  }>;
}

export interface StartConflictReviewRequest {
  id: string;
  note?: string;
}

export interface DecideConflictCheckRequest {
  id: string;
  decision: Extract<ConflictDecision, 'ALLOW' | 'BLOCK'>;
  reason?: string;
}

export interface ListConflictChecksQuery {
  page?: number;
  limit?: number;
  status?: ConflictCheckStatus;
}

const CONFLICT_CHECKS_PREFIX = '/conflict-checks';

export class ConflictChecksClient {
  constructor(private readonly client = new ApiClient()) {}

  request(req: CreateConflictCheckRequest): Promise<ConflictCheckResult> {
    return this.client.body<ConflictCheckResult>(CONFLICT_CHECKS_PREFIX, 'POST', req);
  }

  list(query: ListConflictChecksQuery = {}): Promise<ConflictCheckListResult> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return this.client.body<ConflictCheckListResult>(
      `${CONFLICT_CHECKS_PREFIX}${qs ? `?${qs}` : ''}`,
      'GET',
    );
  }

  get(id: string): Promise<ConflictCheckResult> {
    return this.client.body<ConflictCheckResult>(
      `${CONFLICT_CHECKS_PREFIX}/${encodeURIComponent(id)}`,
      'GET',
    );
  }

  startReview(req: StartConflictReviewRequest): Promise<ConflictCheckResult> {
    return this.client.body<ConflictCheckResult>(
      `${CONFLICT_CHECKS_PREFIX}/${encodeURIComponent(req.id)}/review`,
      'POST',
      { note: req.note ?? undefined },
    );
  }

  decide(req: DecideConflictCheckRequest): Promise<ConflictCheckResult> {
    return this.client.body<ConflictCheckResult>(
      `${CONFLICT_CHECKS_PREFIX}/${encodeURIComponent(req.id)}/decide`,
      'POST',
      { decision: req.decision, reason: req.reason ?? undefined },
    );
  }
}

// -----------------------------------------------------------------------------
// Party Management (Phase 7)
// -----------------------------------------------------------------------------

export type PartyType = 'PERSON' | 'ORGANIZATION';

export interface PartyResult {
  id: string;
  tenantId: string;
  partyType: PartyType;
  name: string | null;
  legalName: string | null;
  displayName: string;
  status: HierarchyStatus;
  clientId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartyRoleResult {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  status: HierarchyStatus;
}

export interface PartyRelationshipPartyRef {
  id: string;
  displayName: string;
  partyType: PartyType;
}

export interface PartyRelationshipResult {
  id: string;
  tenantId: string;
  fromPartyId: string;
  toPartyId: string;
  relationshipType: string;
  status: HierarchyStatus;
  fromParty?: PartyRelationshipPartyRef;
  toParty?: PartyRelationshipPartyRef;
}

export interface PartyListResult {
  data: PartyResult[];
  pagination: PaginationMeta;
}

export interface PartyRelationshipListResult {
  data: PartyRelationshipResult[];
  pagination: PaginationMeta;
}

export interface CreatePartyRequest {
  partyType: PartyType;
  name?: string | null;
  legalName?: string | null;
  displayName: string;
  clientId?: string | null;
  notes?: string | null;
}

export interface UpdatePartyRequest {
  id: string;
  name?: string | null;
  legalName?: string | null;
  displayName?: string;
  notes?: string | null;
}

export interface ArchivePartyRequest {
  id: string;
  reason?: string;
}

export interface ListPartiesQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: HierarchyStatus;
  partyType?: PartyType;
}

export interface CreatePartyRelationshipRequest {
  fromPartyId: string;
  toPartyId: string;
  relationshipType: string;
}

const PARTIES_PREFIX = '/parties';

export class PartyClient {
  constructor(private readonly client = new ApiClient()) {}

  create(req: CreatePartyRequest): Promise<PartyResult> {
    return this.client.body<PartyResult>(PARTIES_PREFIX, 'POST', req);
  }

  list(query: ListPartiesQuery = {}): Promise<PartyListResult> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    if (query.partyType) params.set('partyType', query.partyType);
    const qs = params.toString();
    return this.client.body<PartyListResult>(
      `${PARTIES_PREFIX}${qs ? `?${qs}` : ''}`,
      'GET',
    );
  }

  get(id: string): Promise<PartyResult> {
    return this.client.body<PartyResult>(
      `${PARTIES_PREFIX}/${encodeURIComponent(id)}`,
      'GET',
    );
  }

  update(req: UpdatePartyRequest): Promise<PartyResult> {
    return this.client.body<PartyResult>(
      `${PARTIES_PREFIX}/${encodeURIComponent(req.id)}`,
      'PATCH',
      req,
    );
  }

  archive(req: ArchivePartyRequest): Promise<PartyResult> {
    return this.client.body<PartyResult>(
      `${PARTIES_PREFIX}/${encodeURIComponent(req.id)}`,
      'DELETE',
      { reason: req.reason ?? undefined },
    );
  }

  listRoles(): Promise<PartyRoleResult[]> {
    return this.client.body<PartyRoleResult[]>(`${PARTIES_PREFIX}/roles`, 'GET');
  }

  createRelationship(req: CreatePartyRelationshipRequest): Promise<PartyRelationshipResult> {
    return this.client.body<PartyRelationshipResult>(
      `${PARTIES_PREFIX}/${encodeURIComponent(req.fromPartyId)}/relationships`,
      'POST',
      { toPartyId: req.toPartyId, relationshipType: req.relationshipType },
    );
  }

  listRelationships(
    partyId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<PartyRelationshipListResult> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.client.body<PartyRelationshipListResult>(
      `${PARTIES_PREFIX}/${encodeURIComponent(partyId)}/relationships${qs ? `?${qs}` : ''}`,
      'GET',
    );
  }
}

// -----------------------------------------------------------------------------
// Matter / Case Management (Phase 8)
// -----------------------------------------------------------------------------

export type CaseStatus = 'OPEN' | 'CLOSED' | 'ON_HOLD';
export type CasePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface CaseClientRef {
  id: string;
  displayName: string;
}

export interface CasePartyRef {
  id: string;
  partyId: string;
  roleId: string;
  status: HierarchyStatus;
}

export interface CasePartyResult {
  id: string;
  tenantId: string;
  caseId: string;
  partyId: string;
  roleId: string;
  status: HierarchyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CaseListRow {
  id: string;
  tenantId: string;
  caseNumber: string;
  internalNumber: string | null;
  clientId: string;
  practiceArea: string | null;
  caseType: string | null;
  status: CaseStatus;
  priority: CasePriority;
  openDate: string | null;
  closeDate: string | null;
  createdAt: string;
  updatedAt: string;
  client: CaseClientRef;
  parties: CasePartyRef[];
}

export interface CaseResult {
  id: string;
  tenantId: string;
  caseNumber: string;
  internalNumber: string | null;
  clientId: string;
  practiceArea: string | null;
  caseType: string | null;
  status: CaseStatus;
  priority: CasePriority;
  openDate: string | null;
  closeDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseDetailParty {
  id: string;
  caseId: string;
  partyId: string;
  roleId: string;
  status: HierarchyStatus;
  createdAt: string;
  updatedAt: string;
  party: {
    id: string;
    displayName: string;
    partyType: PartyType;
  };
  role: {
    id: string;
    key: string;
    label: string;
  };
}

export interface CaseDetail extends CaseResult {
  client: CaseClientRef;
  parties: CaseDetailParty[];
}

export interface CaseListResult {
  data: CaseListRow[];
  pagination: PaginationMeta;
}

export interface CreateCaseRequest {
  caseNumber: string;
  internalNumber?: string | null;
  clientId: string;
  practiceArea?: string | null;
  caseType?: string | null;
  status?: CaseStatus;
  priority?: CasePriority;
  openDate?: string | null;
  closeDate?: string | null;
  partyIds?: string[];
}

export interface UpdateCaseRequest {
  id: string;
  caseNumber?: string;
  internalNumber?: string | null;
  practiceArea?: string | null;
  caseType?: string | null;
  status?: CaseStatus;
  priority?: CasePriority;
  openDate?: string | null;
  closeDate?: string | null;
}

export interface AddCasePartyRequest {
  caseId: string;
  partyId: string;
  roleId: string;
}

export interface RemoveCasePartyRequest {
  caseId: string;
  partyId: string;
}

export interface ListCasesQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: CaseStatus;
}

export interface CaseGateBlock {
  partyName: string;
  decision: string;
  reason: string;
  conflictCheckId: string;
}

export type CaseTimelineEventType =
  | 'CASE_CREATED'
  | 'CLIENT_ADDED'
  | 'PARTY_ADDED'
  | 'DOCUMENT_UPLOADED'
  | 'TASK_CREATED'
  | 'HEARING_SCHEDULED'
  | 'DEADLINE_CREATED'
  | 'STATUS_CHANGED'
  | 'NOTE_ADDED'
  | 'INVOICE_CREATED'
  | 'PAYMENT_RECEIVED'
  | 'DOCUMENT_APPROVED'
  | 'CASE_CLOSED';

export interface CaseTimelineEvent {
  id: string;
  tenantId: string;
  caseId: string;
  eventType: CaseTimelineEventType;
  occurredAt: string;
  actorUserId: string | null;
  actorMembershipId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseTimelineListResult {
  data: CaseTimelineEvent[];
  pagination: PaginationMeta;
}

export interface CreateCaseTimelineEventRequest {
  caseId: string;
  eventType: CaseTimelineEventType;
  payload?: Record<string, unknown>;
}

export interface ListCaseTimelineQuery {
  page?: number;
  limit?: number;
}

const CASES_PREFIX = '/cases';

export class CasesClient {
  constructor(private readonly client = new ApiClient()) {}

  create(req: CreateCaseRequest): Promise<CaseResult> {
    return this.client.body<CaseResult>(CASES_PREFIX, 'POST', req);
  }

  list(query: ListCasesQuery = {}): Promise<CaseListResult> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return this.client.body<CaseListResult>(
      `${CASES_PREFIX}${qs ? `?${qs}` : ''}`,
      'GET',
    );
  }

  get(id: string): Promise<CaseDetail> {
    return this.client.body<CaseDetail>(
      `${CASES_PREFIX}/${encodeURIComponent(id)}`,
      'GET',
    );
  }

  update(req: UpdateCaseRequest): Promise<CaseResult> {
    return this.client.body<CaseResult>(
      `${CASES_PREFIX}/${encodeURIComponent(req.id)}`,
      'PATCH',
      req,
    );
  }

  addParty(req: AddCasePartyRequest): Promise<CasePartyResult> {
    return this.client.body<CasePartyResult>(
      `${CASES_PREFIX}/${encodeURIComponent(req.caseId)}/parties`,
      'POST',
      { partyId: req.partyId, roleId: req.roleId },
    );
  }

  removeParty(req: RemoveCasePartyRequest): Promise<void> {
    return this.client.body<void>(
      `${CASES_PREFIX}/${encodeURIComponent(req.caseId)}/parties/${encodeURIComponent(req.partyId)}`,
      'DELETE',
    );
  }

  getTimeline(caseId: string, query: ListCaseTimelineQuery = {}): Promise<CaseTimelineListResult> {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return this.client.body<CaseTimelineListResult>(
      `${CASES_PREFIX}/${encodeURIComponent(caseId)}/timeline${qs ? `?${qs}` : ''}`,
      'GET',
    );
  }

  appendTimelineEvent(req: CreateCaseTimelineEventRequest): Promise<CaseTimelineEvent> {
    return this.client.body<CaseTimelineEvent>(
      `${CASES_PREFIX}/${encodeURIComponent(req.caseId)}/timeline`,
      'POST',
      { eventType: req.eventType, payload: req.payload },
    );
  }
}

// -----------------------------------------------------------------------------
// Legal Configuration (Phase 9): Country / Jurisdiction / Court / Court Location
// -----------------------------------------------------------------------------

export interface CountryResult {
  id: string;
  code: string;
  name: string;
  status: HierarchyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface JurisdictionResult {
  id: string;
  tenantId: string | null;
  countryId: string;
  name: string;
  status: HierarchyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CourtResult {
  id: string;
  tenantId: string | null;
  jurisdictionId: string;
  name: string;
  courtType: string | null;
  department: string | null;
  status: HierarchyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CourtLocationResult {
  id: string;
  tenantId: string | null;
  courtId: string;
  name: string;
  city: string | null;
  address: string | null;
  status: HierarchyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCountryRequest {
  code: string;
  name: string;
}

export interface CreateJurisdictionRequest {
  countryId: string;
  name: string;
}

export interface CreateCourtRequest {
  jurisdictionId: string;
  name: string;
  courtType?: string | null;
  department?: string | null;
}

export interface CreateCourtLocationRequest {
  courtId: string;
  name: string;
  city?: string | null;
  address?: string | null;
}

const LEGAL_CONFIG_PREFIX = '/legal-config';

export class LegalConfigClient {
  constructor(private readonly client = new ApiClient()) {}

  listCountries(): Promise<CountryResult[]> {
    return this.client.body<CountryResult[]>(
      `${LEGAL_CONFIG_PREFIX}/countries`,
      'GET',
    );
  }

  createCountry(req: CreateCountryRequest): Promise<CountryResult> {
    return this.client.body<CountryResult>(
      `${LEGAL_CONFIG_PREFIX}/countries`,
      'POST',
      req,
    );
  }

  listJurisdictions(countryId?: string): Promise<JurisdictionResult[]> {
    const qs = countryId
      ? `?countryId=${encodeURIComponent(countryId)}`
      : '';
    return this.client.body<JurisdictionResult[]>(
      `${LEGAL_CONFIG_PREFIX}/jurisdictions${qs}`,
      'GET',
    );
  }

  createJurisdiction(req: CreateJurisdictionRequest): Promise<JurisdictionResult> {
    return this.client.body<JurisdictionResult>(
      `${LEGAL_CONFIG_PREFIX}/jurisdictions`,
      'POST',
      req,
    );
  }

  listCourts(jurisdictionId?: string): Promise<CourtResult[]> {
    const qs = jurisdictionId
      ? `?jurisdictionId=${encodeURIComponent(jurisdictionId)}`
      : '';
    return this.client.body<CourtResult[]>(
      `${LEGAL_CONFIG_PREFIX}/courts${qs}`,
      'GET',
    );
  }

  createCourt(req: CreateCourtRequest): Promise<CourtResult> {
    return this.client.body<CourtResult>(
      `${LEGAL_CONFIG_PREFIX}/courts`,
      'POST',
      req,
    );
  }

  listCourtLocations(courtId: string): Promise<CourtLocationResult[]> {
    return this.client.body<CourtLocationResult[]>(
      `${LEGAL_CONFIG_PREFIX}/court-locations?courtId=${encodeURIComponent(courtId)}`,
      'GET',
    );
  }

  createCourtLocation(req: CreateCourtLocationRequest): Promise<CourtLocationResult> {
    return this.client.body<CourtLocationResult>(
      `${LEGAL_CONFIG_PREFIX}/court-locations`,
      'POST',
      req,
    );
  }
}

// -----------------------------------------------------------------------------
// Workflow Engine (Phase 11)
// -----------------------------------------------------------------------------

export type WorkflowVersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';

export interface WorkflowStateResult {
  id: string;
  name: string;
  isInitial: boolean;
  isFinal: boolean;
}

export interface WorkflowTransitionResult {
  id: string;
  fromStateId: string | null;
  toStateId: string;
  conditions: Record<string, unknown> | null;
  actions: Record<string, unknown> | null;
  requiresApproval: boolean;
}

export interface WorkflowVersionResult {
  id: string;
  workflowId: string;
  version: number;
  status: WorkflowVersionStatus;
  states?: WorkflowStateResult[];
  transitions?: WorkflowTransitionResult[];
}

export interface WorkflowResult {
  id: string;
  tenantId: string;
  name: string;
  caseType: string | null;
  versions?: WorkflowVersionResult[];
}

export interface CreateWorkflowRequest {
  name: string;
  caseType?: string;
  status?: string;
}

export interface CreateWorkflowStateRequest {
  name: string;
  isInitial?: boolean;
  isFinal?: boolean;
}

export interface CreateWorkflowTransitionRequest {
  fromStateName?: string;
  toStateName: string;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  requiresApproval?: boolean;
}

export interface CreateWorkflowVersionRequest {
  states: CreateWorkflowStateRequest[];
  transitions: CreateWorkflowTransitionRequest[];
}

const WORKFLOWS_PREFIX = '/workflows';

export class WorkflowsClient {
  constructor(private readonly client = new ApiClient()) {}

  listWorkflows(): Promise<WorkflowResult[]> {
    return this.client.body<WorkflowResult[]>(WORKFLOWS_PREFIX, 'GET');
  }

  createWorkflow(req: CreateWorkflowRequest): Promise<WorkflowResult> {
    return this.client.body<WorkflowResult>(WORKFLOWS_PREFIX, 'POST', req);
  }

  createVersion(workflowId: string, req: CreateWorkflowVersionRequest): Promise<WorkflowVersionResult> {
    return this.client.body<WorkflowVersionResult>(
      `${WORKFLOWS_PREFIX}/${encodeURIComponent(workflowId)}/versions`,
      'POST',
      req,
    );
  }

  publishVersion(versionId: string): Promise<WorkflowVersionResult> {
    return this.client.body<WorkflowVersionResult>(
      `${WORKFLOWS_PREFIX}/versions/${encodeURIComponent(versionId)}/publish`,
      'POST',
    );
  }
}

export interface HearingResult {
  id: string;
  tenantId: string;
  caseId: string;
  courtId: string | null;
  courtLocationId: string | null;
  assignedLawyerId: string | null;
  date: string;
  time: string | null;
  hearingType: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED';
  outcome: string | null;
  notes: string | null;
  nextHearingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHearingRequest {
  caseId: string;
  courtId?: string;
  courtLocationId?: string;
  assignedLawyerId?: string;
  date: string;
  time?: string;
  hearingType?: string;
  notes?: string;
  nextHearingId?: string;
}

export interface UpdateHearingOutcomeRequest {
  outcome?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED';
}

const HEARINGS_PREFIX = '/v1/hearings';

export class HearingsClient {
  constructor(private readonly client = new ApiClient()) {}

  listHearings(caseId?: string): Promise<HearingResult[]> {
    const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : '';
    return this.client.body<HearingResult[]>(`${HEARINGS_PREFIX}${qs}`, 'GET');
  }

  createHearing(req: CreateHearingRequest): Promise<HearingResult> {
    return this.client.body<HearingResult>(HEARINGS_PREFIX, 'POST', req);
  }

  recordOutcome(id: string, req: UpdateHearingOutcomeRequest): Promise<HearingResult> {
    return this.client.body<HearingResult>(
      `${HEARINGS_PREFIX}/${encodeURIComponent(id)}/outcome`,
      'POST',
      req,
    );
  }

  deleteHearing(id: string): Promise<void> {
    return this.client.body<void>(`${HEARINGS_PREFIX}/${encodeURIComponent(id)}`, 'DELETE');
  }
}

// --- Phase 13: Deadlines ---

export interface DeadlineRuleResult {
  id: string;
  name: string;
  description?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface DeadlineResult {
  id: string;
  caseId: string;
  title: string;
  deadlineType: string;
  dueDate: string;
  status: string;
  ruleId?: string;
}

export interface CreateDeadlineRuleRequest {
  name: string;
  description?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface CreateDeadlineRequest {
  caseId: string;
  title: string;
  description?: string;
  deadlineType: string;
  dueDate: string;
  ruleId?: string;
}

const DEADLINES_PREFIX = '/v1/deadlines';

export class DeadlinesClient {
  constructor(private readonly client = new ApiClient()) {}

  listDeadlines(caseId?: string): Promise<{ data: DeadlineResult[] }> {
    const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : '';
    return this.client.body<{ data: DeadlineResult[] }>(DEADLINES_PREFIX + qs, 'GET');
  }

  createDeadline(req: CreateDeadlineRequest): Promise<DeadlineResult> {
    return this.client.body<DeadlineResult>(DEADLINES_PREFIX, 'POST', req);
  }

  listRules(): Promise<{ data: DeadlineRuleResult[] }> {
    return this.client.body<{ data: DeadlineRuleResult[] }>(DEADLINES_PREFIX + '/rules', 'GET');
  }

  createRule(req: CreateDeadlineRuleRequest): Promise<DeadlineRuleResult> {
    return this.client.body<DeadlineRuleResult>(DEADLINES_PREFIX + '/rules', 'POST', req);
  }
}

// --- Phase 14: Tasks ---

export interface TaskResult {
  id: string;
  caseId?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  assignedUserId?: string;
  parentTaskId?: string;
}

export interface CreateTaskRequest {
  caseId?: string;
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  assignedUserId?: string;
  parentTaskId?: string;
}

export interface UpdateTaskStatusRequest {
  status: string;
}

export interface AssignTaskRequest {
  assignedUserId: string;
}

const TASKS_PREFIX = '/v1/tasks';

export class TasksClient {
  constructor(private readonly client = new ApiClient()) {}

  listTasks(caseId?: string, assignedUserId?: string): Promise<{ data: TaskResult[] }> {
    const params = new URLSearchParams();
    if (caseId) params.append('caseId', caseId);
    if (assignedUserId) params.append('assignedUserId', assignedUserId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.client.body<{ data: TaskResult[] }>(TASKS_PREFIX + qs, 'GET');
  }

  createTask(req: CreateTaskRequest): Promise<TaskResult> {
    return this.client.body<TaskResult>(TASKS_PREFIX, 'POST', req);
  }

  updateStatus(id: string, req: UpdateTaskStatusRequest): Promise<TaskResult> {
    return this.client.body<TaskResult>(`${TASKS_PREFIX}/${encodeURIComponent(id)}/status`, 'PATCH', req);
  }

  assignTask(id: string, req: AssignTaskRequest): Promise<TaskResult> {
    return this.client.body<TaskResult>(`${TASKS_PREFIX}/${encodeURIComponent(id)}/assign`, 'PATCH', req);
  }
}

// --- Phase 15: Documents ---

export interface DocumentResult {
  id: string;
  caseId?: string;
  clientId?: string;
  title: string;
  description?: string;
  documentType?: string;
  status: string;
  versions?: any[];
}

export interface CreateDocumentRequest {
  caseId?: string;
  clientId?: string;
  title: string;
  description?: string;
  documentType?: string;
  storageObjectId: string;
  mimeType: string;
  fileSize: number;
  checksum?: string;
}

export interface UploadNewVersionRequest {
  storageObjectId: string;
  mimeType: string;
  fileSize: number;
  checksum?: string;
}

export interface UpdateDocumentStatusRequest {
  status: string;
}

export interface ShareDocumentRequest {
  sharedWithEmail: string;
  expiresAt?: string;
}

const DOCUMENTS_PREFIX = '/v1/documents';

export class DocumentsClient {
  constructor(private readonly client = new ApiClient()) {}

  listDocuments(caseId?: string, clientId?: string): Promise<{ data: DocumentResult[] }> {
    const params = new URLSearchParams();
    if (caseId) params.append('caseId', caseId);
    if (clientId) params.append('clientId', clientId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.client.body<{ data: DocumentResult[] }>(DOCUMENTS_PREFIX + qs, 'GET');
  }

  createDocument(req: CreateDocumentRequest): Promise<DocumentResult> {
    return this.client.body<DocumentResult>(DOCUMENTS_PREFIX, 'POST', req);
  }

  uploadNewVersion(id: string, req: UploadNewVersionRequest): Promise<any> {
    return this.client.body<any>(`${DOCUMENTS_PREFIX}/${encodeURIComponent(id)}/versions`, 'POST', req);
  }

  updateStatus(id: string, req: UpdateDocumentStatusRequest): Promise<DocumentResult> {
    return this.client.body<DocumentResult>(`${DOCUMENTS_PREFIX}/${encodeURIComponent(id)}/status`, 'PATCH', req);
  }

  shareDocument(id: string, req: ShareDocumentRequest): Promise<any> {
    return this.client.body<any>(`${DOCUMENTS_PREFIX}/${encodeURIComponent(id)}/shares`, 'POST', req);
  }
}


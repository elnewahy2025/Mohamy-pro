import { evaluateAuthorization } from './policy.evaluator';
import type {
  AuthorizationRequest,
  AuthorizationRole,
  AuthorizationSnapshot,
  AuthorizationSubject,
} from './authorization.types';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_TENANT_ID = '44444444-4444-4444-8444-444444444444';
const RESOURCE_ID = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-08-26T10:00:00.000Z');

const subject: AuthorizationSubject = {
  userId: USER_ID,
  userStatus: 'ACTIVE',
  activeTenantId: TENANT_ID,
  activeMembershipId: MEMBERSHIP_ID,
  mfaVerifiedAt: new Date('2026-08-26T09:55:00.000Z'),
  mfaAcr: 'urn:mohamy:loa:2',
  mfaAmr: ['pwd', 'mfa'],
};

function role(
  key: AuthorizationRole['key'],
  scope: AuthorizationRole['scope'] = 'TENANT',
  permissions: string[] = [],
  assignmentScope?: AuthorizationRole['assignmentScope'],
): AuthorizationRole {
  return { key, scope, permissions, assignmentScope };
}

function snapshot(
  tenantMembershipRoles: AuthorizationRole[],
  overrides: Partial<AuthorizationSnapshot> = {},
): AuthorizationSnapshot {
  return {
    membership: {
      id: MEMBERSHIP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      status: 'ACTIVE',
      activeFrom: null,
      activeUntil: null,
      tenantStatus: 'ACTIVE',
    },
    tenantMembershipRoles,
    globalRoles: [],
    denials: [],
    ...overrides,
  };
}

function request(
  policy: AuthorizationRequest['policy'],
  roleInput: AuthorizationRole,
  resource: AuthorizationRequest['resource'] = {},
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    policy,
    subject,
    targetTenantId: TENANT_ID,
    resource,
    snapshot: snapshot([roleInput]),
    now,
    mfaSatisfied: true,
    ...overrides,
  };
}

describe('evaluateAuthorization', () => {
  it('allows tenant administration only with a tenant-admin permission and recent MFA', () => {
    const result = evaluateAuthorization(
      request(
        'CanManageMembership',
        role('tenant_admin', 'TENANT', ['membership.manage']),
      ),
    );

    expect(result).toEqual({
      allowed: true,
      policy: 'CanManageMembership',
      permissionKey: 'membership.manage',
      roleKey: 'tenant_admin',
      requiresMfa: true,
    });
  });

  it('denies a tenant admin attempting to elevate a user to Platform Admin', () => {
    const result = evaluateAuthorization(
      request(
        'CanManageMembership',
        role('tenant_admin', 'TENANT', ['membership.manage']),
        { targetRoleKey: 'platform_admin' },
      ),
    );

    expect(result.reasonCode).toBe('platform_role_elevation_denied');
    expect(result.allowed).toBe(false);
  });

  it('requires MFA for a global Platform Admin operation', () => {
    const result = evaluateAuthorization({
      policy: 'CanPerformPlatformOperation',
      subject: { ...subject, activeTenantId: null, activeMembershipId: null },
      targetTenantId: undefined,
      snapshot: snapshot([], {
        membership: undefined,
        globalRoles: [
          role('platform_admin', 'GLOBAL', ['tenant.platform_manage']),
        ],
      }),
      now,
      mfaSatisfied: false,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: 'platform_admin_mfa_required',
      requiresMfa: true,
    });
  });

  it.each([
    ['managing_partner', 'case.read'],
    ['lawyer', 'case.read'],
    ['paralegal', 'case.read'],
    ['client', 'case.read'],
  ] as const)(
    'recognizes the frozen %s case-read permission',
    (key, permission) => {
      const result = evaluateAuthorization(
        request('CanAccessResource', role(key, 'TENANT', [permission]), {
          permissionKey: permission,
          resourceType: 'case',
          resourceId: RESOURCE_ID,
          ...(key === 'lawyer' || key === 'paralegal'
            ? { assignedMembershipIds: [MEMBERSHIP_ID] }
            : {}),
          ...(key === 'client' ? { primaryClientUserId: USER_ID } : {}),
        }),
      );

      expect(result.allowed).toBe(true);
    },
  );

  it('requires explicit assignment for lawyer case access', () => {
    const result = evaluateAuthorization(
      request('CanAccessResource', role('lawyer', 'TENANT', ['case.read']), {
        permissionKey: 'case.read',
        resourceType: 'case',
        resourceId: RESOURCE_ID,
        assignedMembershipIds: [],
      }),
    );

    expect(result.reasonCode).toBe('resource_unassigned');
  });

  it('requires explicit assignment for paralegal document access', () => {
    const result = evaluateAuthorization(
      request(
        'CanAccessResource',
        role('paralegal', 'TENANT', ['document.read']),
        {
          permissionKey: 'document.read',
          resourceType: 'document',
          resourceId: RESOURCE_ID,
          assignedMembershipIds: [],
        },
      ),
    );

    expect(result.reasonCode).toBe('resource_unassigned');
  });

  it('enforces client ownership and explicit shared-document flags', () => {
    const invoice = evaluateAuthorization(
      request('CanAccessResource', role('client', 'TENANT', ['invoice.read']), {
        permissionKey: 'invoice.read',
        resourceType: 'invoice',
        primaryClientUserId: '66666666-6666-4666-8666-666666666666',
      }),
    );
    const document = evaluateAuthorization(
      request(
        'CanAccessResource',
        role('client', 'TENANT', ['document.read']),
        {
          permissionKey: 'document.read',
          resourceType: 'document',
          sharedWithClient: false,
        },
      ),
    );

    expect(invoice.reasonCode).toBe('resource_not_owned');
    expect(document.reasonCode).toBe('client_document_not_shared');
  });

  it('denies permanent deletion of legal records to standard users', () => {
    const result = evaluateAuthorization(
      request(
        'CanAccessResource',
        role('lawyer', 'TENANT', ['document.update', 'document.read']),
        {
          permissionKey: 'document.update',
          resourceType: 'document',
          action: 'DELETE',
          legalRecord: true,
          assignedMembershipIds: [MEMBERSHIP_ID],
        },
      ),
    );

    expect(result.reasonCode).toBe('permanent_deletion_denied');
  });

  it('blocks explicit active denials before grants', () => {
    const result = evaluateAuthorization({
      ...request('CanAccessResource', role('lawyer', 'TENANT', ['case.read']), {
        permissionKey: 'case.read',
        resourceType: 'case',
        resourceId: RESOURCE_ID,
        assignedMembershipIds: [MEMBERSHIP_ID],
      }),
      snapshot: snapshot([role('lawyer', 'TENANT', ['case.read'])], {
        denials: [
          {
            tenantId: TENANT_ID,
            subjectUserId: USER_ID,
            permissionKey: 'case.read',
            resourceType: 'case',
            resourceId: RESOURCE_ID,
            status: 'ACTIVE',
            startsAt: new Date('2026-08-26T09:00:00.000Z'),
            endsAt: null,
            revokedAt: null,
          },
        ],
      }),
    });

    expect(result.reasonCode).toBe('explicit_denial');
  });

  it('blocks tenant escape and scope mismatch', () => {
    const escape = evaluateAuthorization({
      ...request(
        'CanViewTenant',
        role('managing_partner', 'TENANT', ['tenant.read']),
        {},
        { targetTenantId: OTHER_TENANT_ID },
      ),
    });
    const scope = evaluateAuthorization(
      request(
        'CanAccessResource',
        role('lawyer', 'TENANT', ['case.read'], {
          departmentIds: ['77777777-7777-4777-8777-777777777777'],
        }),
        {
          permissionKey: 'case.read',
          resourceType: 'case',
          assignedMembershipIds: [MEMBERSHIP_ID],
          departmentId: '88888888-8888-4888-8888-888888888888',
        },
      ),
    );

    expect(escape.reasonCode).toBe('tenant_escape');
    expect(scope.reasonCode).toBe('scope_mismatch');
  });

  it('requires an active membership for tenant switching and allows the eligible case', () => {
    const allowed = evaluateAuthorization({
      policy: 'CanSwitchTenant',
      subject,
      targetTenantId: TENANT_ID,
      snapshot: snapshot([], { tenantMembershipRoles: [] }),
      now,
      mfaSatisfied: true,
    });
    const denied = evaluateAuthorization({
      policy: 'CanSwitchTenant',
      subject,
      targetTenantId: TENANT_ID,
      snapshot: snapshot([], {
        membership: {
          ...snapshot([]).membership!,
          status: 'SUSPENDED',
        },
      }),
      now,
      mfaSatisfied: true,
    });

    expect(allowed.allowed).toBe(true);
    expect(denied.reasonCode).toBe('membership_not_eligible');
  });
});

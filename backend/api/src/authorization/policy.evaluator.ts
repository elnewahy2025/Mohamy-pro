import {
  type AuthorizationDecision,
  type AuthorizationDenial,
  type AuthorizationRequest,
  type AuthorizationResource,
  type AuthorizationRole,
  type PermissionKey,
  type PolicyName,
} from './authorization.types';

const ACTIVE_USER_STATUS = 'ACTIVE';
const ACTIVE_MEMBERSHIP_STATUS = 'ACTIVE';
const ACTIVE_TENANT_STATUS = 'ACTIVE';
const ACTIVE_DENIAL_STATUS = 'ACTIVE';

const POLICY_PERMISSIONS: Record<PolicyName, PermissionKey | null> = {
  CanViewTenant: 'tenant.read',
  CanManageMembership: 'membership.manage',
  CanSwitchTenant: 'tenant.switch',
  CanReadOrganizationSettings: 'organization_settings.read',
  CanManageRole: 'role.manage',
  CanManagePermission: 'permission.manage',
  CanManageDenial: 'denial.manage',
  CanAccessResource: null,
  CanPerformPlatformOperation: 'tenant.platform_manage',
};

const STAFF_SENSITIVE_POLICIES = new Set<PolicyName>([
  'CanManageMembership',
  'CanManageRole',
  'CanManagePermission',
  'CanManageDenial',
  'CanPerformPlatformOperation',
]);

export function evaluateAuthorization(
  input: AuthorizationRequest,
): AuthorizationDecision {
  const now = input.now ?? new Date();
  const policy = input.policy;
  const resource = input.resource ?? {};
  const snapshot = input.snapshot ?? {
    tenantMembershipRoles: [],
    globalRoles: [],
    denials: [],
  };
  const permissionKey = resolvePermission(policy, resource);
  const requiresMfa =
    policy === 'CanPerformPlatformOperation' ||
    STAFF_SENSITIVE_POLICIES.has(policy);
  const deny = (
    reasonCode: AuthorizationDecision['reasonCode'],
  ): AuthorizationDecision => ({
    allowed: false,
    policy,
    ...(permissionKey ? { permissionKey } : {}),
    reasonCode,
    ...(requiresMfa ? { requiresMfa: true } : {}),
  });

  if (!input.subject || input.subject.userStatus !== ACTIVE_USER_STATUS) {
    return deny('authentication_required');
  }

  const targetTenantId = input.targetTenantId ?? resource.tenantId;
  if (policy === 'CanSwitchTenant') {
    if (!targetTenantId || !snapshot.membership) {
      return deny('tenant_context_required');
    }
    if (!isEligibleMembership(snapshot.membership, now, input.subject.userId)) {
      return deny('membership_not_eligible');
    }
    return allow(policy, permissionKey, 'membership');
  }

  if (!targetTenantId && policy !== 'CanPerformPlatformOperation') {
    return deny('tenant_context_required');
  }

  const isPlatformAdmin = hasPlatformAdminRole(snapshot.globalRoles);
  if (
    input.subject.activeTenantId &&
    input.subject.activeTenantId !== targetTenantId &&
    !isPlatformAdmin
  ) {
    return deny('tenant_escape');
  }

  const membership = snapshot.membership;
  if (
    !isPlatformAdmin &&
    (!targetTenantId ||
      !membership ||
      !isEligibleMembership(membership, now, input.subject.userId) ||
      membership.tenantId !== targetTenantId)
  ) {
    return deny('membership_not_eligible');
  }

  const targetRoleKey = resource.targetRoleKey;
  if (
    (policy === 'CanManageMembership' ||
      policy === 'CanManageRole' ||
      policy === 'CanManagePermission') &&
    targetRoleKey === 'platform_admin' &&
    !isPlatformAdmin
  ) {
    return deny('platform_role_elevation_denied');
  }

  if (policy === 'CanManageMembership' && resource.billingPlanChange === true) {
    return deny('billing_plan_change_denied');
  }

  const roles = isPlatformAdmin
    ? [...snapshot.globalRoles, ...snapshot.tenantMembershipRoles]
    : snapshot.tenantMembershipRoles;
  const permissionRole = roles.find((role) =>
    grantsPermission(role, permissionKey),
  );
  if (!permissionRole && policy !== 'CanViewTenant') {
    return deny('permission_missing');
  }
  if (!permissionRole && policy === 'CanViewTenant') {
    return deny('permission_missing');
  }

  const matchingDenial = targetTenantId
    ? snapshot.denials.find((denial) =>
        isActiveDenial(
          denial,
          now,
          input.subject.userId,
          targetTenantId,
          resource,
          permissionKey,
        ),
      )
    : undefined;
  if (matchingDenial) {
    return deny('explicit_denial');
  }

  const resourceDecision = evaluateResource(policy, permissionKey, resource, {
    subjectUserId: input.subject.userId,
    membershipId: input.subject.activeMembershipId,
    role: permissionRole,
    isPlatformAdmin,
  });
  if (resourceDecision) return deny(resourceDecision);

  if (requiresMfa && input.mfaSatisfied !== true) {
    return deny(
      policy === 'CanPerformPlatformOperation'
        ? 'platform_admin_mfa_required'
        : 'mfa_step_up_required',
    );
  }

  return allow(policy, permissionKey, permissionRole?.key, requiresMfa);
}

export function grantsPermission(
  role: AuthorizationRole,
  permissionKey: PermissionKey | undefined,
): boolean {
  if (!permissionKey) return false;
  return role.permissions.includes(permissionKey);
}

export function hasPlatformAdminRole(roles: AuthorizationRole[]): boolean {
  return roles.some(
    (role) =>
      role.scope === 'GLOBAL' &&
      role.key === 'platform_admin' &&
      grantsPermission(role, 'tenant.platform_manage'),
  );
}

function resolvePermission(
  policy: PolicyName,
  resource: AuthorizationResource,
): PermissionKey | undefined {
  if (policy === 'CanAccessResource') return resource.permissionKey;
  return POLICY_PERMISSIONS[policy] ?? undefined;
}

function evaluateResource(
  policy: PolicyName,
  permissionKey: PermissionKey | undefined,
  resource: AuthorizationResource,
  context: {
    subjectUserId: string;
    membershipId: string | null;
    role?: AuthorizationRole;
    isPlatformAdmin: boolean;
  },
): AuthorizationDecision['reasonCode'] | undefined {
  if (context.isPlatformAdmin || policy !== 'CanAccessResource')
    return undefined;
  if (!permissionKey) return 'permission_missing';

  if (
    resource.legalRecord === true &&
    resource.action === 'DELETE' &&
    ['case', 'document', 'invoice'].includes(resource.resourceType ?? '')
  ) {
    return 'permanent_deletion_denied';
  }

  if (
    (permissionKey === 'case.read' ||
      permissionKey === 'case.update' ||
      permissionKey.startsWith('document.')) &&
    ['lawyer', 'paralegal'].includes(context.role?.key ?? '') &&
    !resource.assignedMembershipIds?.includes(context.membershipId ?? '')
  ) {
    return 'resource_unassigned';
  }

  if (
    ['invoice.read', 'invoice.pay'].includes(permissionKey) &&
    context.role?.key === 'client' &&
    resource.primaryClientUserId !== context.subjectUserId
  ) {
    return 'resource_not_owned';
  }

  if (
    permissionKey === 'document.read' &&
    context.role?.key === 'client' &&
    resource.sharedWithClient !== true
  ) {
    return 'client_document_not_shared';
  }

  if (!matchesRoleScope(context.role, resource)) return 'scope_mismatch';
  return undefined;
}

function matchesRoleScope(
  role: AuthorizationRole | undefined,
  resource: AuthorizationResource,
): boolean {
  if (!role?.assignmentScope) return true;
  const scope = role.assignmentScope;
  if (scope.branchIds && !scope.branchIds.includes(resource.branchId ?? '')) {
    return false;
  }
  if (
    scope.departmentIds &&
    !scope.departmentIds.includes(resource.departmentId ?? '')
  ) {
    return false;
  }
  if (scope.teamIds && !scope.teamIds.includes(resource.teamId ?? '')) {
    return false;
  }
  return true;
}

function isEligibleMembership(
  membership: NonNullable<AuthorizationRequest['snapshot']>['membership'],
  now: Date,
  userId: string,
): boolean {
  if (!membership) return false;
  return (
    membership.userId === userId &&
    membership.status === ACTIVE_MEMBERSHIP_STATUS &&
    (!membership.activeFrom || membership.activeFrom <= now) &&
    (!membership.activeUntil || membership.activeUntil >= now) &&
    (!membership.tenantStatus ||
      membership.tenantStatus === ACTIVE_TENANT_STATUS)
  );
}

function isActiveDenial(
  denial: AuthorizationDenial,
  now: Date,
  userId: string,
  tenantId: string,
  resource: AuthorizationResource,
  permissionKey: PermissionKey | undefined,
): boolean {
  return (
    denial.tenantId === tenantId &&
    denial.status === ACTIVE_DENIAL_STATUS &&
    denial.revokedAt === null &&
    denial.startsAt <= now &&
    (!denial.endsAt || denial.endsAt >= now) &&
    (denial.subjectUserId === null || denial.subjectUserId === userId) &&
    denial.permissionKey === (permissionKey ?? '') &&
    (!denial.resourceType || denial.resourceType === resource.resourceType) &&
    (!denial.resourceId || denial.resourceId === resource.resourceId)
  );
}

function allow(
  policy: PolicyName,
  permissionKey: PermissionKey | undefined,
  roleKey?: string,
  requiresMfa = false,
): AuthorizationDecision {
  return {
    allowed: true,
    policy,
    ...(permissionKey ? { permissionKey } : {}),
    ...(roleKey ? { roleKey } : {}),
    ...(requiresMfa ? { requiresMfa: true } : {}),
  };
}

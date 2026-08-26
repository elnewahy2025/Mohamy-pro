export const POLICY_NAMES = [
  'CanViewTenant',
  'CanManageMembership',
  'CanSwitchTenant',
  'CanReadOrganizationSettings',
  'CanManageRole',
  'CanManagePermission',
  'CanManageDenial',
  'CanAccessResource',
  'CanPerformPlatformOperation',
] as const;

export type PolicyName = (typeof POLICY_NAMES)[number];

export const PERMISSION_KEYS = [
  'tenant.read',
  'tenant.manage',
  'organization_settings.read',
  'membership.manage',
  'role.manage',
  'permission.manage',
  'denial.manage',
  'case.read',
  'case.update',
  'financial.read',
  'financial.approve',
  'document.create',
  'document.read',
  'document.update',
  'invoice.read',
  'invoice.pay',
  'tenant.platform_manage',
  'tenant.switch',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type RoleKey =
  | 'platform_admin'
  | 'tenant_admin'
  | 'managing_partner'
  | 'lawyer'
  | 'paralegal'
  | 'client';

export interface AuthorizationSession {
  userId: string;
  userStatus: string;
  activeTenantId: string | null;
  activeMembershipId: string | null;
  mfaVerifiedAt?: Date | null;
  mfaAcr?: string | null;
  mfaAmr?: unknown;
}

export type AuthorizationSubject = AuthorizationSession;

export interface AuthorizationScope {
  organizationIds?: string[];
  branchIds?: string[];
  departmentIds?: string[];
  teamIds?: string[];
}

export interface AuthorizationResource {
  tenantId?: string;
  resourceType?: string;
  resourceId?: string;
  permissionKey?: PermissionKey;
  action?: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'PAY';
  ownerUserId?: string;
  primaryClientUserId?: string;
  assignedMembershipIds?: string[];
  sharedWithClient?: boolean;
  organizationId?: string;
  branchId?: string;
  departmentId?: string;
  teamId?: string;
  legalRecord?: boolean;
  targetRoleKey?: string;
  targetUserId?: string;
  billingPlanChange?: boolean;
}

export interface AuthorizationRole {
  key: string;
  scope: 'GLOBAL' | 'TENANT';
  permissions: string[];
  assignmentScope?: AuthorizationScope;
}

export interface AuthorizationDenial {
  tenantId: string;
  subjectUserId: string | null;
  permissionKey: string;
  resourceType: string | null;
  resourceId: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
}

export interface AuthorizationMembership {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  activeFrom?: Date | null;
  activeUntil?: Date | null;
  tenantStatus?: string;
}

export interface AuthorizationSnapshot {
  membership?: AuthorizationMembership;
  tenantMembershipRoles: AuthorizationRole[];
  globalRoles: AuthorizationRole[];
  denials: AuthorizationDenial[];
}

export interface AuthorizationRequest {
  policy: PolicyName;
  subject: AuthorizationSubject;
  targetTenantId?: string;
  resource?: AuthorizationResource;
  snapshot?: AuthorizationSnapshot;
  now?: Date;
  mfaSatisfied?: boolean;
}

export type AuthorizationDenyReason =
  | 'authentication_required'
  | 'user_not_active'
  | 'tenant_context_required'
  | 'tenant_escape'
  | 'membership_not_eligible'
  | 'permission_missing'
  | 'explicit_denial'
  | 'resource_unassigned'
  | 'resource_not_owned'
  | 'client_document_not_shared'
  | 'permanent_deletion_denied'
  | 'scope_mismatch'
  | 'platform_admin_mfa_required'
  | 'mfa_step_up_required'
  | 'unknown_policy'
  | 'platform_role_elevation_denied'
  | 'billing_plan_change_denied'
  | 'action_not_allowed';

export interface AuthorizationAccessView {
  tenantId: string | null;
  membershipId: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthorizationDecision {
  allowed: boolean;
  policy: PolicyName;
  permissionKey?: PermissionKey;
  reasonCode?: AuthorizationDenyReason;
  roleKey?: string;
  requiresMfa?: boolean;
}

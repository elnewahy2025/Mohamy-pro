import {
  ROLE_KEY_TENANT_ADMIN,
  ROLE_KEY_PLATFORM_ADMIN,
} from './role.constants';

export const PERMISSION_KEYS = {
  CAN_CREATE_TENANT: 'CanCreateTenant',
  CAN_GRANT_PLATFORM_ADMIN: 'CanGrantPlatformAdmin',
  CAN_MANAGE_MEMBERSHIP: 'CanManageMembership',
  CAN_INVITE_MEMBERS: 'CanInviteMembers',
  CAN_VIEW_TENANT: 'CanViewTenant',
  CAN_MANAGE_ROLES: 'CanManageRoles',
  CAN_SWITCH_TENANT: 'CanSwitchTenant',
  CAN_MANAGE_ORGANIZATION_CONFIG: 'CanManageOrganizationConfig',
  CAN_MANAGE_CLIENTS: 'CanManageClients',
} as const;

export type PermissionKey =
  (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

export interface PermissionDefinition {
  key: PermissionKey;
  description: string;
}

/**
 * The global, environment-independent application permission catalog. Each key
 * is scoped either to a tenant ("Can*" on tenant-owned resources) or to the
 * platform ("Can*Tenant", "CanGrantPlatformAdmin"). The catalog is seeded
 * once via migration (the Permission table is not RLS-enforced) and must not be
 * mutated at runtime; role wiring owns the assignment mapping.
 */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  {
    key: PERMISSION_KEYS.CAN_CREATE_TENANT,
    description: 'Create a new tenant (Platform Admin).',
  },
  {
    key: PERMISSION_KEYS.CAN_GRANT_PLATFORM_ADMIN,
    description: 'Grant or revoke Platform Admin assignment (Platform Admin).',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
    description: 'Administer memberships within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_INVITE_MEMBERS,
    description: 'Create and manage invitations within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_VIEW_TENANT,
    description: 'View tenant-scoped data within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_ROLES,
    description: 'Manage roles and role assignments within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_SWITCH_TENANT,
    description:
      'Switch the active session tenant to a tenant the user has an ACTIVE membership in.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_ORGANIZATION_CONFIG,
    description:
      'Administer organization configuration and hierarchy within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_CLIENTS,
    description:
      'Create, update, archive, and list clients within the active tenant.',
  },
];

/**
 * Default permission set granted to each built-in role. Keyed by stable role
 * key; keeps the built-in role→permission matrix in one auditable location so
 * the bootstrap and the reconciliation path stay consistent.
 */
export const ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  [ROLE_KEY_TENANT_ADMIN]: [
    PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
    PERMISSION_KEYS.CAN_INVITE_MEMBERS,
    PERMISSION_KEYS.CAN_MANAGE_ROLES,
    PERMISSION_KEYS.CAN_VIEW_TENANT,
    PERMISSION_KEYS.CAN_SWITCH_TENANT,
    PERMISSION_KEYS.CAN_MANAGE_ORGANIZATION_CONFIG,
    PERMISSION_KEYS.CAN_MANAGE_CLIENTS,
  ],
  [ROLE_KEY_PLATFORM_ADMIN]: [
    PERMISSION_KEYS.CAN_CREATE_TENANT,
    PERMISSION_KEYS.CAN_GRANT_PLATFORM_ADMIN,
    PERMISSION_KEYS.CAN_VIEW_TENANT,
  ],
};

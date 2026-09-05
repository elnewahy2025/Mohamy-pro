import {
  ROLE_KEY_TENANT_ADMIN,
  ROLE_KEY_TENANT_MANAGER,
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
  CAN_MANAGE_CONFLICT_CHECKS: 'CanManageConflictChecks',
  CAN_MANAGE_PARTIES: 'CanManageParties',
  CAN_MANAGE_CASES: 'CanManageCases',
  CAN_VIEW_CASE_TIMELINE: 'CanViewCaseTimeline',
  CAN_MANAGE_LEGAL_CONFIG: 'CanManageLegalConfig',
  CAN_MANAGE_GLOBAL_LEGAL_CONFIG: 'CanManageGlobalLegalConfig',
  CAN_MANAGE_WORKFLOWS: 'CanManageWorkflows',
  CAN_MANAGE_HEARINGS: 'CanManageHearings',
  CAN_MANAGE_DEADLINES: 'CanManageDeadlines',
  CAN_MANAGE_TASKS: 'CanManageTasks',
  CAN_MANAGE_DOCUMENTS: 'CanManageDocuments',
  CAN_APPROVE_TIME_ENTRIES: 'CanApproveTimeEntries',
  CAN_PUBLISH_WORKFLOW_VERSIONS: 'CanPublishWorkflowVersions',
  CAN_MANAGE_BILLING: 'CanManageBilling',
  CAN_APPROVE_INVOICES: 'CanApproveInvoices',
  CAN_RECORD_PAYMENTS: 'CanRecordPayments',
  CAN_MANAGE_COMMUNICATIONS: 'CanManageCommunications',
  CAN_MANAGE_CALENDAR: 'CanManageCalendar',
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
  {
    key: PERMISSION_KEYS.CAN_MANAGE_CONFLICT_CHECKS,
    description:
      'Request, review, and decide conflict checks within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_PARTIES,
    description:
      'Create, update, archive, and list parties and party relationships within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_CASES,
    description:
      'Create, update, and list cases (matters) and link parties within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_VIEW_CASE_TIMELINE,
    description:
      'Read-only access to the append-only timeline projection of events for a case.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_LEGAL_CONFIG,
    description:
      'Manage tenant-specific legal configurations (e.g. courts, jurisdictions).',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_GLOBAL_LEGAL_CONFIG,
    description:
      'Manage global legal reference data such as countries (Platform Admin).',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_WORKFLOWS,
    description:
      'Manage workflows, versions, and states within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_HEARINGS,
    description: 'Manage case hearings and internal calendar events.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_DEADLINES,
    description: 'Manage legal deadlines and reminder rules.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_TASKS,
    description: 'Manage workflows and individual assignments for tasks.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_DOCUMENTS,
    description: 'Upload, version, share, and archive documents.',
  },
  {
    key: PERMISSION_KEYS.CAN_APPROVE_TIME_ENTRIES,
    description:
      'Approve or reject submitted time entries within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_PUBLISH_WORKFLOW_VERSIONS,
    description: 'Publish draft workflow versions within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_BILLING,
    description:
      'Create fees, expenses, draft invoices, credits, and tax rules within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_APPROVE_INVOICES,
    description: 'Issue, void, and version invoices within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_RECORD_PAYMENTS,
    description: 'Record payments and refunds within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_COMMUNICATIONS,
    description:
      'Compose messages, manage threads and consent, and record delivery within the active tenant.',
  },
  {
    key: PERMISSION_KEYS.CAN_MANAGE_CALENDAR,
    description:
      'Manage calendar connections, sync state, and conflicts within the active tenant.',
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
    PERMISSION_KEYS.CAN_MANAGE_CONFLICT_CHECKS,
    PERMISSION_KEYS.CAN_MANAGE_PARTIES,
    PERMISSION_KEYS.CAN_MANAGE_CASES,
    PERMISSION_KEYS.CAN_VIEW_CASE_TIMELINE,
    PERMISSION_KEYS.CAN_MANAGE_LEGAL_CONFIG,
    PERMISSION_KEYS.CAN_MANAGE_WORKFLOWS,
    PERMISSION_KEYS.CAN_MANAGE_HEARINGS,
    PERMISSION_KEYS.CAN_MANAGE_DEADLINES,
    PERMISSION_KEYS.CAN_MANAGE_TASKS,
    PERMISSION_KEYS.CAN_MANAGE_DOCUMENTS,
    PERMISSION_KEYS.CAN_APPROVE_TIME_ENTRIES,
    PERMISSION_KEYS.CAN_PUBLISH_WORKFLOW_VERSIONS,
    PERMISSION_KEYS.CAN_MANAGE_BILLING,
    PERMISSION_KEYS.CAN_APPROVE_INVOICES,
    PERMISSION_KEYS.CAN_RECORD_PAYMENTS,
    PERMISSION_KEYS.CAN_MANAGE_COMMUNICATIONS,
    PERMISSION_KEYS.CAN_MANAGE_CALENDAR,
  ],
  [ROLE_KEY_TENANT_MANAGER]: [
    PERMISSION_KEYS.CAN_VIEW_TENANT,
    PERMISSION_KEYS.CAN_APPROVE_TIME_ENTRIES,
    PERMISSION_KEYS.CAN_PUBLISH_WORKFLOW_VERSIONS,
    PERMISSION_KEYS.CAN_APPROVE_INVOICES,
    PERMISSION_KEYS.CAN_RECORD_PAYMENTS,
  ],
  [ROLE_KEY_PLATFORM_ADMIN]: [
    PERMISSION_KEYS.CAN_CREATE_TENANT,
    PERMISSION_KEYS.CAN_GRANT_PLATFORM_ADMIN,
    PERMISSION_KEYS.CAN_VIEW_TENANT,
    PERMISSION_KEYS.CAN_MANAGE_GLOBAL_LEGAL_CONFIG,
  ],
};

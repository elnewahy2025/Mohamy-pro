# Authorization Matrix

## 1. Purpose
Define the authoritative mapping between roles, permissions, resources, actions, scopes, and denials. This matrix is the source for automated authorization tests.

## 2. Default Roles
- **Platform Admin**: Superuser for the entire SaaS platform (cross-tenant). IMPLEMENTED (`platform.admin`).
- **Tenant Admin**: Administrator for a specific law firm (Tenant). IMPLEMENTED (`tenant.admin`, all tenant keys).
- **Tenant Manager**: Approve/record powers only (`CanViewTenant`, `CanApproveTimeEntries`, `CanPublishWorkflowVersions`, `CanApproveInvoices`, `CanRecordPayments`). IMPLEMENTED (`tenant.manager`, ensured per tenant by reconcile; members assigned explicitly, never automatic).
- **Managing Partner**: High-level oversight within a Tenant. DEFERRED — semantics require read/update-split case keys, which do not exist; granting `CanManageCases` would exceed the documented Read/Update scope. Blocked, not silently dropped.
- **Lawyer**: Standard legal practitioner. DEFERRED — semantics require case-assignment enforcement (G5); creating it tenant-wide today would misrepresent "assigned cases only".
- **Paralegal/Staff**: Support staff with limited scope. DEFERRED — same assignment blocker as Lawyer.
- **Client**: External user accessing the Client Portal. DEFERRED — requires the Phase 24 portal; no authentication surface exists for external clients today.

## 3. Core Permission Matrix

| Role | Resource | Action | Scope | Conditions |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Admin** | All Tenants | Create, Read, Update, Delete, Suspend | Global | Requires MFA |
| **Tenant Admin** | Organization Settings | Create, Read, Update | Tenant | Cannot modify billing plan directly |
| **Tenant Admin** | Users/Memberships | Create, Read, Update, Delete | Tenant | Cannot elevate others to Platform Admin |
| **Managing Partner**| Case | Read, Update | Tenant | Can view all cases within the firm |
| **Managing Partner**| Financials | Read, Approve | Tenant | |
| **Lawyer** | Case | Read, Update | Assigned Cases | Can only access cases where they are explicitly assigned as team members |
| **Lawyer** | Document | Create, Read, Update | Assigned Cases | Cannot permanently delete documents |
| **Paralegal** | Case | Read | Assigned Cases | Read-only access to case details |
| **Paralegal** | Document | Create, Read | Assigned Cases | Can upload drafts, cannot approve final versions |
| **Client** | Case | Read | Client's Own Cases | Strictly limited to cases where the user is the primary Client |
| **Client** | Invoice | Read, Pay | Client's Own Cases | |
| **Client** | Document | Read | Shared Documents | Can only view documents explicitly marked as "Shared with Client" |

## 4. Named-policy enforcement (Phase 2 closure, W3)

The application policy engine (`PermissionsService.assertTenantPermission`) evaluates
named policies resolved from an ACTIVE membership's role→permission graph. The status
of each frozen named policy against the implemented Phase 2 routes is recorded below so
no policy is silently omitted from enforcement or documentation.

| Named policy | Source | Route(s) that enforce it | Status |
| :--- | :--- | :--- | :--- |
| `CanManageMembership` | `permission.constants.ts`, seeded migration | `POST /membership/invitations`, `POST /membership/invitations/accept`, `PATCH /membership/members/{suspend,expire,remove,reinstate}` | **ENFORCED + tested** |
| `CanSwitchTenant` | `permission.constants.ts`, `migration 20260901120000` | `POST /session/tenant-switch` | **ENFORCED + tested** (membership-default: any ACTIVE membership may switch to a tenant it belongs to) |
| `CanViewTenant` | catalog + seeded | none (no dedicated route); underlying read capability | **No dedicated route yet** (decision recorded) |
| `CanInviteMembers` | catalog + seeded | none; invitation gates on the stronger `CanManageMembership` | **No dedicated route yet** (decision recorded) |
| `CanManageRoles` | catalog + seeded | none (no role-management route exists) | **No dedicated route yet** (decision recorded) |
| `CanCreateTenant`, `CanGrantPlatformAdmin` | catalog + seeded, global | none (tenant creation is via the global `POST /bootstrap` flow) | **No dedicated route yet** (decision recorded) |
| `CanReadOrganizationSettings` | docs-only (Phase 2 plan), **never catalogued/seeded** | none (no Organization Settings surface exists) | **DEFERRED**: no route exists; documented deferral, not a silent omission. To be added to the catalog when a real Organization Settings surface is introduced. |

## 5. Explicit Denials
- **Tenant Escape**: No user (except Platform Admin) can ever access resources belonging to a `tenant_id` different from their currently active session's `tenant_id`.
- **Permanent Deletion**: Legal records (Cases, Documents, Invoices) cannot be permanently deleted by standard users; they must be archived or marked void, preserving the audit trail.
- **Unassigned Access**: Lawyers and Paralegals are explicitly denied access to Cases they are not assigned to, unless a "Break Glass" override is approved and audited.

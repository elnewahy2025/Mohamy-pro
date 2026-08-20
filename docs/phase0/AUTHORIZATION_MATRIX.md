# Authorization Matrix

## 1. Purpose
Define the authoritative mapping between roles, permissions, resources, actions, scopes, and denials. This matrix is the source for automated authorization tests.

## 2. Default Roles
- **Platform Admin**: Superuser for the entire SaaS platform (cross-tenant).
- **Tenant Admin**: Administrator for a specific law firm (Tenant).
- **Managing Partner**: High-level oversight within a Tenant.
- **Lawyer**: Standard legal practitioner.
- **Paralegal/Staff**: Support staff with limited scope.
- **Client**: External user accessing the Client Portal.

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

## 4. Explicit Denials
- **Tenant Escape**: No user (except Platform Admin) can ever access resources belonging to a `tenant_id` different from their currently active session's `tenant_id`.
- **Permanent Deletion**: Legal records (Cases, Documents, Invoices) cannot be permanently deleted by standard users; they must be archived or marked void, preserving the audit trail.
- **Unassigned Access**: Lawyers and Paralegals are explicitly denied access to Cases they are not assigned to, unless a "Break Glass" override is approved and audited.

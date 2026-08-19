# Authorization

Model:
- RBAC
- ABAC
- Resource-level authorization
- Tenant isolation
- Branch restrictions
- Department restrictions
- Explicit denials

Rules:
- Backend authorization is authoritative.
- Frontend permissions are for UI only.
- Authorization must consider membership, role, ownership, assignment, and resource attributes.

Policy approach:
- Use named policies such as `CanViewCase`, `CanDownloadDocument`, and `CanApproveInvoice`.
- Do not spread raw role checks across modules.


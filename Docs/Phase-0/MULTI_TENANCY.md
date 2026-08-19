# Multi-Tenancy

Tenant model:
- A tenant represents a law firm, legal office, organization, or SaaS customer.

Isolation rules:
- Never trust tenant ID from the browser.
- Derive tenant context from authenticated membership.
- Enforce tenant isolation in database, repository, service, search, cache, job processing, object storage, exports, and integrations.

Boundary rules:
- Tenant is the security boundary.
- Organization is the operating boundary.
- Branch is the location boundary.
- Department is the team boundary.
- Team is a flexible assignment construct.


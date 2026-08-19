# Domain Model

Canonical entity hierarchy:
- Tenant
- Organization
- Branch
- Department
- Team
- Membership
- User

Canonical legal record:
- `Case`

Core domain families:
- Identity
- Tenancy
- Authorization
- Client Management
- Party Management
- Case Management
- Court and Jurisdiction
- Workflow
- Deadlines
- Tasks
- Documents
- Communications
- Time Tracking
- Billing
- Reporting
- Notifications
- Conflict Check
- Intake
- Audit

Domain rules:
- `Matter` may be used only as a UI alias.
- Tenant context is derived from membership, not from client input.
- Parties are distinct from clients.


# AUTHORIZATION_TRACEABILITY_MATRIX.md — Phase × Resource (through Phase 23)

Columns: Phase | Resource | Permission | Role | ABAC | Resource policy | Backend enforcement | Tests | Docs | Status.
`✅`=verified, `⚠️`=partial, `❌`=missing/failed. Evidence pointers abbreviated (`pc`=permission.constants.ts, `ops`=module operations, `spec`=service spec).

| Ph | Resource | Permission | Role | ABAC | Resource policy | Enforcement | Tests | Docs | St |
|---|---|---|---|---|---|---|---|---|---|
| 2 | Membership/invitation/switch | CanManageMembership, CanSwitchTenant, CanInviteMembers | tenant.admin | MFA, abuse caps, window checks | member-of-tenant | guards+ops+RLS | engine/switch/session genuine | matrix §4, completion plan | ✅ |
| 2 | Roles/permissions/denials | CanManageRoles | admin | — | — | NO role-mgmt API; denials unevaluated | none | matrix (records gap) | ❌ |
| 3 | Audit/security foundation | (policies as keys) | admin | rate-limit, abuse | append-only | middleware+guards | genuine | plan | ✅ |
| 4 | Org hierarchy/settings | CanManageOrganizationConfig | admin | none (branch data-only) | tenant | guards+ops+RLS | allow+deny ✅ | plan | ✅ |
| 5 | Clients/contacts/addresses | CanManageClients | admin | none | tenant+parent | guards+ops+RLS | allow+deny ✅ | plan | ✅ |
| 6 | Conflict checks/graph | CanManageConflictChecks | admin | none | tenant | guards+ops+RLS | allow+deny ✅ | plan | ✅ |
| 7 | Parties/relationships | CanManageParties | admin | none | tenant | guards+ops+RLS | allow-only ⚠️ | plan | ⚠️ |
| 8 | Cases | CanManageCases | admin | assignment MISSING | tenant only (no assignee join) | guards+ops+RLS | mocked-authz ⚠️ | matrix anticipates assignment | ⚠️ |
| 9 | Countries/jurisdictions/courts | View/Global/Manage splits | admin/platform | hybrid global-vs-tenant | parent visibility | class guards, implicit req ⚠️ | partial ⚠️ | core review | ⚠️ |
| 10 | Timeline | CanViewCaseTimeline | admin | append-only | case-in-tenant | guards+ops+RLS | allow+tenant-deny ✅ | plan | ✅ |
| 11 | Workflows | CanManageWorkflows + CanPublishWorkflowVersions | admin+manager(publish) | version integrity | tenant | guards+split authorize | mocked-authz ⚠️ | plan | ⚠️ |
| 12 | Hearings | CanManageHearings | admin | court hybrid visibility | tenant+parent | guards+ops+RLS | allow+tenant-deny ✅ | plan | ✅ |
| 13 | Deadlines/rules | CanManageDeadlines | admin | none | tenant | guards+ops+RLS | allow+deny ✅ | plan | ✅ |
| 14 | Tasks | CanManageTasks | admin | assignee stored, unenforced | tenant | guards+ops+RLS | allow+deny ✅ | plan | ✅ |
| 15 | Documents/versions/shares | CanManageDocuments | admin | classification/sharing stored, unenforced | tenant | guarded controller ✅; ocr/security submodules ❌ | controller allow+deny ✅; submodules none | plan | ⚠️ |
| 16 | Scans/grants/downloads | (none — fail-closed adapters) | — | scan-gate in service | tenant RLS (migration) | guarded controller; adapters throw | fail-closed specs ✅ | wiring guide | ⚠️ |
| 17 | OCR jobs/pages/entities | (none — fail-closed) | — | tenant checks added 2026-09 | tenant RLS | ocr.controller ❌ unguarded | adapter specs only | plan | ❌ |
| 18 | Search/reindex | (none — fail-closed) | — | tenant filter pass-through | tenant RLS | both controllers ❌ | adapter specs only | plan | ❌ |
| 19 | Templates/generation | (none — fail-closed) | — | — | tenant RLS | both controllers ❌ (`'system'` fallback) | adapter specs only | plan | ❌ |
| 20 | Time/timers/rates | CanApproveTimeEntries (approve/reject); rest auth-only | admin+manager | owner-scoping submit/pause/stop | tenant+owner | guards+DTOs ✅ (fixed 2026-09) | service specs ✅ | plan | ✅ |
| 21 | Fees/expenses/invoices/payments/credits/refunds/ledger/tax | CanManageBilling + CanApproveInvoices + CanRecordPayments | admin+manager | balanced-post, idempotency, immutable ledger | tenant | guards+3-level authorize | state specs ✅, no perm-deny test | plan | ⚠️ |
| 22 | Threads/messages/consent | CanManageCommunications | admin | consent enforced, link required | tenant | guards+authorize | state specs ✅, no perm-deny test | plan | ⚠️ |
| 23 | Connections/mappings/conflicts | CanManageCalendar | admin | no-token rule, idempotent mappings | tenant | guards+authorize | state specs ✅, no perm-deny test | plan | ⚠️ |

Cross-cutting: `tenant.manager` never instantiated (dead matrix entry); `platform.admin` MFA-gated bootstrap verified; metrics token-checked; health public by design.

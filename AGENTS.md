# AGENTS.md — Mohamy Pro Agent Instructions

## 1. Purpose

This file is the **repository-level operating contract for AI coding agents** working on Mohamy Pro.

It defines:

* the canonical repository location;
* repository and Git safety rules;
* mandatory skills and engineering practices;
* phase-gate requirements;
* database and migration safety;
* implementation and scope rules;
* testing and verification requirements;
* evidence/reporting requirements;
* backend formatting rules;
* frontend conventions;
* conditions under which an agent MUST stop rather than guess.

These instructions apply to **all AI agents and coding assistants** working in this repository.

---

# 2. Canonical Working Directory

The canonical and authoritative working directory for this repository is:

```text
/root/Mohamy-pro-backup
```

This directory is the **single source of truth for local repository work**.

It is the full clone synchronized with:

```text
https://github.com/elnewahy2025/Mohamy-pro.git
```

Primary branch:

```text
main
```

## Mandatory rule

**ALL repository operations MUST be performed from:**

```text
/root/Mohamy-pro-backup
```

This includes:

* reading repository source files;
* editing source files;
* creating files;
* deleting files;
* loading repository-local skills;
* running tests;
* running builds;
* running linters;
* running formatters;
* running Prisma commands;
* running migration commands;
* running application verification;
* running Git commands;
* committing;
* fetching;
* pulling;
* pushing;
* inspecting Git history.

If the current working directory is different:

```bash
cd /root/Mohamy-pro-backup
```

Then verify:

```bash
pwd
```

Expected:

```text
/root/Mohamy-pro-backup
```

---

# 3. Forbidden Worktree

The following path is **NOT authoritative**:

```text
/root/imported-project/...
```

It is a stale/truncated snapshot from an older repository lineage and contains an outdated uppercase `Docs/` snapshot.

## NEVER

* edit code there;
* read it as authoritative project state;
* run Git operations there;
* run tests there;
* create migrations there;
* copy code from it into the canonical repository;
* use it to determine current project architecture;
* use it to determine current phase status;
* use it to determine current Git state.

If information differs between `/root/imported-project/...` and `/root/Mohamy-pro-backup`, the canonical repository wins.

---

# 4. Repository State Is Evidence, Not Assumption

`AGENTS.md` provides governance and project context.

It is **NOT proof of current repository state**.

Before making claims about:

* current branch;
* current commit;
* migration state;
* database state;
* tests;
* build status;
* implementation status;
* phase status;
* Git synchronization;
* deployment state;
* security status;

the agent MUST inspect the repository and/or execute the appropriate verification command.

Never treat a statement in this document such as:

```text
tests pass
migration is applied
phase is complete
database is clean
```

as current evidence unless it is re-verified.

Historical statements MUST be treated as historical.

---

# 5. Mandatory Startup Protocol

Before modifying code, the agent MUST perform the following startup sequence.

## Step 1 — Enter canonical repository

```bash
cd /root/Mohamy-pro-backup
```

## Step 2 — Confirm working directory

```bash
pwd
```

Expected:

```text
/root/Mohamy-pro-backup
```

## Step 3 — Inspect working tree

```bash
git status -sb
```

## Step 4 — Confirm branch

```bash
git branch --show-current
```

## Step 5 — Inspect recent commits

```bash
git log -5 --oneline --decorate
```

## Step 6 — Synchronize remote metadata

```bash
git fetch origin
```

## Step 7 — Inspect divergence

```bash
git status -sb
git log --oneline --decorate --graph -10
```

If the remote has moved ahead, **do not blindly overwrite or reset local work**.

Review the new commits first.

## Step 8 — Load mandatory skills

Load the mandatory skills described in Section 6.

## Step 9 — Determine the requested phase/task

Identify:

* requested phase;
* previous phase;
* current branch;
* relevant documentation;
* relevant migration(s);
* relevant modules;
* relevant tests;
* previous delivery-review gate.

## Step 10 — Verify the phase gate

Do NOT begin implementation until the previous phase's delivery-review gate has been proven owner-approved.

If approval cannot be proven:

**STOP IMPLEMENTATION.**

Do not infer approval from:

* passing tests;
* merged code;
* a commit;
* AGENTS.md;
* another agent's claim;
* apparent completeness.

---

# 6. Mandatory Skills

Before any:

* implementation;
* debugging;
* refactoring;
* testing;
* security work;
* architecture change;
* code review;

the following skills MUST be loaded and applied.

### Mandatory

```text
engineering-governance
single-responsibility-file-architecture
```

Expected locations:

```text
~/.agents/skills/engineering-governance/SKILL.md
~/.agents/skills/single-responsibility-file-architecture/SKILL.md
```

Use the environment's native skill-loading mechanism when available.

If the native `skill` tool is unavailable, read the corresponding `SKILL.md` files directly from the paths above.

The agent MUST NOT claim that a skill was applied unless the skill was actually loaded/read.

---

# 7. Relevant Global Skills

The following skills are installed globally and may be relevant.

| Skill                                     | Path                                                                | Applies When                                              |
| ----------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| `engineering-governance`                  | `~/.agents/skills/engineering-governance/SKILL.md`                  | **Mandatory** for implementation/debugging/testing/review |
| `single-responsibility-file-architecture` | `~/.agents/skills/single-responsibility-file-architecture/SKILL.md` | **Mandatory** when creating/refactoring code              |
| `vercel-composition-patterns`             | `~/.agents/skills/vercel-composition-patterns/`                     | React component composition                               |
| `vercel-react-best-practices`             | `~/.agents/skills/vercel-react-best-practices/`                     | React/Next.js performance                                 |
| `web-design-guidelines`                   | `~/.agents/skills/web-design-guidelines/SKILL.md`                   | UI accessibility/design review                            |

Other globally installed skills may exist.

Load additional skills only when the task actually requires them.

Unrelated skills include, but are not limited to:

```text
android
anyclaw-publish
composio-cli
flightclaw
search-codex-chats
telegram-bridge-send
twitter-auto-post-shizuku
```

Do not load unrelated skills merely because they are installed.

---

# 8. Engineering Governance

All implementation must follow evidence-based engineering governance.

## Core rule

**Never claim that something is verified unless the relevant command was actually executed.**

The agent must distinguish between:

```text
Observed
```

and:

```text
Assumed
```

and:

```text
Not verified
```

For example:

Bad:

```text
The migration is safe.
```

Good:

```text
prisma migrate deploy exited 0 against the test database.
This verifies that the migration chain applies successfully to that database.
Production/live database state remains unverified.
```

---

# 9. Verification Evidence Contract

For every meaningful implementation or debugging task, report verification using:

```text
Command:
Working directory:
Exit code:
Result:
Relevant output:
What this proves:
What remains unverified:
```

Example:

```text
Command:
pnpm test -- --runInBand

Working directory:
/root/Mohamy-pro-backup/backend/api

Exit code:
0

Result:
PASS

Relevant output:
322/322 tests passed.

What this proves:
The executed Jest test suite passed in this environment.

What remains unverified:
Live PostgreSQL migration state was not tested.
```

Never use words such as:

* verified;
* fixed;
* passing;
* complete;
* safe;
* production-ready;

unless the available evidence actually supports that claim.

---

# 10. Scope Discipline

Implement **only the requested task and its directly required dependencies**.

Do NOT silently expand scope.

Do not:

* refactor unrelated modules;
* rewrite working architecture;
* upgrade dependencies without explicit need;
* replace infrastructure merely because another solution is preferred;
* implement deferred functionality;
* change unrelated APIs;
* modify unrelated migrations;
* alter frontend code during backend work;
* rewrite project conventions;
* perform broad cleanup unrelated to the task.

If a broader architectural change appears necessary:

1. explain why;
2. identify the dependency;
3. identify the risk;
4. stop if authorization is required.

Do not silently turn a bug fix into a redesign.

---

# 11. Data Safety

Preserve the user's work unconditionally.

Never:

* delete user work;
* overwrite uncommitted changes;
* reset the repository destructively;
* use destructive Git commands to "clean things up";
* discard files merely because they appear unrelated;
* replace existing implementation without first understanding it.

Before potentially destructive operations, create an offline backup under:

```text
/root/safety-backups/
```

Examples of dangerous operations requiring extreme caution:

```bash
git reset --hard
git clean -fd
git checkout -- .
rm -rf
prisma migrate reset
database drop
database truncate
```

Do not use destructive operations merely to make tests pass.

---

# 12. Git Remote

Remote:

```text
https://github.com/elnewahy2025/Mohamy-pro.git
```

Repository:

```text
elnewahy2025/Mohamy-pro
```

Primary branch:

```text
main
```

The repository owner/author is:

```text
Khaled Osman
```

The owner pushes directly to:

```text
origin/main
```

---

# 13. Git Workflow

Before pushing:

```bash
cd /root/Mohamy-pro-backup
git fetch origin
```

Then inspect:

```bash
git status -sb
git log --oneline --decorate --graph -20
```

If `origin/main` has advanced:

1. review the incoming commits;
2. understand whether they affect the current work;
3. preserve local work;
4. rebase as appropriate.

Do NOT blindly force-push.

Avoid:

```bash
git push --force
```

unless explicitly authorized and the consequences are fully understood.

---

# 14. Post-Push Verification

After a successful push, verify:

```bash
git fetch origin
git rev-parse main
git rev-parse origin/main
git status -sb
```

The expected state is:

```text
git rev-parse main == git rev-parse origin/main
```

and a clean working tree.

Do not claim the push is fully synchronized without checking.

---

# 15. Commit Rules

Before committing:

1. inspect the diff;
2. inspect changed files;
3. run relevant tests;
4. run relevant build/type checks;
5. run Prettier checks;
6. verify no unrelated files were modified.

Use:

```bash
git status --short
git diff --stat
git diff
```

Never commit:

* secrets;
* credentials;
* private keys;
* local environment files containing secrets;
* generated junk;
* unrelated changes.

---

# 16. Forced-Phase Rule

The project follows the forced-phase rule documented in:

```text
Plan.txt
```

The relevant rule is recorded around:

```text
Plan.txt line 1297
```

## Absolute requirement

**Do not begin implementation of Phase N until Phase N-1's delivery-review gate has been owner-approved.**

Code being present is NOT approval.

Tests passing is NOT approval.

A previous agent saying "done" is NOT approval.

AGENTS.md saying "sealed" is NOT approval.

A Git commit is NOT approval.

If the owner-approved delivery-review evidence cannot be located:

```text
PHASE BLOCKED — OWNER APPROVAL NOT PROVEN
```

Stop implementation.

---

# 17. Database and Migration Safety

This repository uses Prisma and PostgreSQL.

Database changes are security-sensitive and must be handled conservatively.

## Absolute migration rules

### Never

* edit an already-applied migration;
* delete an already-applied migration;
* rename an already-applied migration;
* rewrite migration history to hide drift;
* mark a migration applied without evidence;
* use destructive migration commands against a shared/live database;
* run `prisma migrate reset` against a shared/live database;
* modify production migration history merely to make Prisma happy;
* resolve checksum mismatch by silently changing historical migrations.

### Before changing migrations

Inspect:

```bash
pnpm exec prisma migrate status
```

and inspect:

```text
prisma/migrations/
```

Understand:

* current migration chain;
* migration ordering;
* whether migrations are applied;
* whether migrations are pending;
* whether drift exists;
* whether the target database is fresh, local, test, staging, or live.

---

# 18. Fresh Database vs Upgrade-Path Validation

These are different verification claims.

A successful fresh database migration proves:

```text
The complete migration chain can build a database from zero.
```

It does NOT prove:

```text
An existing production database can safely upgrade.
```

Likewise, successful upgrade-path testing does not prove a fresh database works.

Agents MUST state which one was tested.

---

# 19. Migration Timestamp Rule

Migration directory timestamps are repository identifiers.

For example:

```text
20260906150000_...
```

must NOT automatically be interpreted as evidence that the migration was executed on that calendar date.

Migration names are not sufficient evidence of:

* deployment date;
* application date;
* production state;
* chronological execution.

Always inspect actual migration state.

---

# 20. RLS / Tenant Isolation Safety

Mohamy Pro uses PostgreSQL Row-Level Security.

Tenant isolation is security-critical.

Relevant architecture includes:

* composite tenant-aware uniqueness;
* PostgreSQL RLS;
* `FORCE ROW LEVEL SECURITY`;
* tenant isolation policies;
* `app_tenant_context_is_valid()`;
* service-level `withTenantContext`;
* cross-tenant visibility checks;
* protected migration/administrative connections where required.

Never weaken RLS merely to make an application query succeed.

Do not:

* disable FORCE RLS;
* bypass tenant policies;
* use a superuser to hide authorization bugs;
* remove tenant predicates merely to fix tests;
* introduce cross-tenant fallback queries.

If a query fails because of RLS:

**Treat the failure as potentially security-significant until proven otherwise.**

---

# 21. Authorization and Security

Authorization failures must be investigated at the complete boundary:

```text
Authentication
    ↓
Session
    ↓
Tenant Context
    ↓
Membership
    ↓
Permission / Policy
    ↓
MFA Assurance
    ↓
CSRF / Origin
    ↓
RLS
    ↓
Database Operation
```

Do not "fix" an authorization error by removing a guard or bypassing RLS without proving that the security contract permits it.

Security-sensitive behavior must preserve:

* tenant isolation;
* authentication requirements;
* authorization policy;
* MFA requirements;
* CSRF protection;
* session integrity;
* auditability;
* idempotency;
* error non-enumeration.

---

# 22. Error Handling

Security-sensitive errors must not unnecessarily reveal:

* whether another tenant's object exists;
* internal database details;
* secrets;
* credentials;
* authorization internals;
* token values;
* cryptographic material.

Internal diagnostics may contain detailed information, but externally exposed API errors must follow the project's established non-enumerating error contracts.

Never return raw Prisma/database errors directly to clients unless the project's existing architecture explicitly requires it.

---

# 23. Current Project Architecture

Backend:

```text
backend/api
```

Technology stack includes:

```text
NestJS
Prisma
PostgreSQL
PostgreSQL RLS
Redis
BullMQ
Keycloak / OIDC
MinIO
```

The backend architecture uses additive phase migrations, permission seeds, audit events, and focused modules.

Typical module structure:

```text
*.operations.ts
*.service.ts
*.controller.ts
*.dto.ts
*.errors.ts
*.module.ts
*.spec.ts
```

Each file should maintain a focused responsibility.

Modules using authentication guards import the appropriate authentication module.

---

# 24. Current Phase State

The following reflects the known project history and is **context only**.

Current repository state MUST be independently verified before relying on it.

## Phase 4 — Organization Configuration

Migration:

```text
20260902120000_...
```

Status:

```text
Sealed
```

---

## Phase 5 — Client Management

Entities:

```text
Client
ClientContact
ClientAddress
```

Permission:

```text
CanManageClients
```

Module:

```text
clients/
```

Migrations:

```text
20260902180000_...
20260902190000_...
```

Status:

```text
Sealed
```

---

## Phase 6 — Conflict Check Foundation

Entities:

```text
ConflictCheck
ConflictParty
```

Permission:

```text
CanManageConflictChecks
```

Module:

```text
conflict-checks/
```

Migration:

```text
20260903100000_...
```

Gate contract:

```text
ConflictGateService.assertClearForCase
```

Returns:

```text
GateVerdict {
  cleared,
  blocks,
  reasons
}
```

The method does **not** throw for a blocked conflict gate.

Status:

```text
Sealed
```

---

## Phase 7 — Party Management

Entities:

```text
Party
PartyRole
PartyRelationship
```

Permission:

```text
CanManageParties
```

Module:

```text
parties/
```

Migration:

```text
20260904100000_...
```

Case-party contract:

```text
src/parties/case-party.contract.ts
```

Provides:

```text
CasePartyLinker
CasePartyLink
```

Status:

```text
Sealed
```

---

## Phase 8 — Case Management

Entities:

```text
Case
CaseParty
```

Permission:

```text
CanManageCases
```

Module:

```text
cases/
```

Migration:

```text
20260904120000_...
```

Case creation uses:

```text
ConflictGateService.assertClearForCase
```

A blocked gate results in:

```text
CaseGateRejectionError
```

Status:

```text
Sealed
```

---

## Phase 9 — Legal Configuration

Entities:

```text
Country
Jurisdiction
Court
CourtLocation
```

Permissions:

```text
CanManageLegalConfig
CanManageGlobalLegalConfig
```

Module:

```text
legal-config/
```

Migration:

```text
20260904150000_...
```

### Hybrid tenancy

`tenantId` is nullable.

```text
NULL
```

means global dictionary data.

A concrete:

```text
tenantId
```

means tenant-scoped data.

RLS permits appropriate global dictionary access and tenant-scoped access according to policy.

`LegalConfigOperations.requireParentVisible` prevents attaching a child to a parent belonging to another tenant.

Delivered functionality includes:

```text
create
list
```

Status:

```text
Delivered
```

---

## Phase 10 — Case Timeline

Entity:

```text
CaseTimelineEvent
```

Permission:

```text
CanViewCaseTimeline
```

Module:

```text
case-timeline/
```

Migration:

```text
20260904160000_...
```

Security:

```text
FORCE RLS
tenant isolation
```

Status:

```text
Delivered
```

---

## Phase 11 — Workflow Engine Definition/Storage

Entities:

```text
Workflow
WorkflowVersion
WorkflowState
WorkflowTransition
```

Permission:

```text
CanManageWorkflows
```

Module:

```text
workflows/
```

Migration:

```text
20260905100000_...
```

Important:

**Phase 11 provides storage/definition functionality only.**

The execution engine was intentionally deferred and must not be silently implemented.

Status:

```text
Storage delivered
Execution engine deferred
```

Security:

```text
FORCE RLS
tenant isolation
```

---

## Phase 12 — Hearing Management

Entity:

```text
Hearing
```

Permission:

```text
CanManageHearings
```

Module:

```text
hearings/
```

Migration:

```text
20260906100000_...
```

Internal calendar/attendee aggregation was deferred.

Status:

```text
Delivered
```

Security:

```text
FORCE RLS
tenant isolation
```

---

## Phase 13 — Legal Deadline Engine

Entities:

```text
DeadlineRule
Deadline
```

Permission:

```text
CanManageDeadlines
```

Module:

```text
deadlines/
```

Migration:

```text
20260906120000_...
```

CRUD was delivered.

The computation engine was deferred.

Status:

```text
CRUD delivered
Computation engine deferred
```

Security:

```text
FORCE RLS
tenant isolation
```

---

## Phase 14 — Task Management

Entities:

```text
Task
TaskChecklist
TaskDependency
```

Permission:

```text
CanManageTasks
```

Module:

```text
tasks/
```

Migration:

```text
20260906140000_...
```

Child-table tenant remediation:

```text
20260907000000_...
```

Status:

```text
Delivered
```

Security:

```text
FORCE RLS
tenant isolation
```

---

## Phase 15 — Document Management

Entities:

```text
Document
DocumentVersion
DocumentTag
DocumentMetadata
DocumentShare
DocumentAccess
```

Permission:

```text
CanManageDocuments
```

Module:

```text
documents/
```

Migration:

```text
20260906150000_...
```

Important:

**Phase 15 provides metadata/CRUD only.**

Real object storage was deliberately deferred because it is security-sensitive.

Do NOT silently implement the deferred storage layer as part of unrelated work.

Security:

```text
FORCE RLS
tenant isolation
```

Child-table tenant remediation:

```text
20260907000000_...
```

---

# 25. Phase 10–15 Remediation

Remediation documentation:

```text
docs/AUDIT_REMEDIATION_PHASES_10_15.md
```

Known remediation areas include:

```text
R0–R10
```

Cross-cutting changes included:

```text
20260905100000
workflow migration repair

20260907000000_phase10_15_rls_isolation
tenantId additions to seven child tables
FORCE RLS on all 16 Phase 10–15 tables

20260907010000_phase10_15_permission_seal
permission sealing

reconcileBuiltInRoles
startup role reconciliation
```

Controllers use:

```text
SessionGuard
CsrfGuard
```

Cross-tenant attachment checks use:

```text
requireVisible
```

Audit allowlists were expanded and:

```text
workflow.version.created
```

was added.

### Historical verification state

The remediation was previously recorded as:

```text
tsc = 0
nest build = 0
prettier clean
322/322 Jest tests
```

However:

**These numbers are historical evidence, not current proof.**

The current state MUST be re-verified before being reported as passing.

The previous environment did not have PostgreSQL available for live migration validation.

Therefore:

```text
fresh-DB prisma migrate deploy
```

remains a release-gating verification step unless current evidence proves otherwise.

---

# 26. Deferred Functionality Rule

The repository deliberately contains functionality that was deferred.

Examples include:

```text
Phase 11 workflow execution engine
Phase 12 internal calendar/attendee aggregation
Phase 13 deadline computation engine
Phase 15 real object storage
```

Deferred functionality is **recorded scope**, not unfinished work that an agent should automatically implement.

Do not implement deferred functionality unless the current task explicitly authorizes it.

---

# 27. Backend Prettier Rules

Prettier is the formatter for backend TypeScript.

Configuration:

```text
backend/api/.prettierrc
```

Current configuration:

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

Markdown documentation is NOT automatically prettier-formatted.

Repository convention is to maintain Markdown wrapping manually.

---

# 28. Backend Formatting Commands

All backend commands must run from:

```text
/root/Mohamy-pro-backup/backend/api
```

Check:

```bash
./node_modules/.bin/prettier --check "src/**/*.ts" "test/**/*.ts"
```

Format:

```bash
./node_modules/.bin/prettier --write "src/**/*.ts" "test/**/*.ts"
```

## Important

Do NOT run:

```bash
npm run format
```

Do NOT run:

```bash
npx prettier
```

because this environment may trigger:

```text
EBADDEVENGINES
```

Use the direct binary:

```text
./node_modules/.bin/prettier
```

---

# 29. Formatting Gate

Every touched backend `.ts` file MUST be Prettier-clean before commit.

Preferred sequence:

```bash
./node_modules/.bin/prettier --check "src/**/*.ts" "test/**/*.ts"
```

If formatting is required, format only files changed by the current task whenever possible.

Do NOT reformat unrelated files.

---

# 30. Testing Rules

Tests must be selected according to the changed functionality.

At minimum, consider:

```text
unit tests
integration tests
authorization tests
RLS tests
migration tests
runtime verification
```

Do not claim that the entire system passes merely because one focused test passes.

Distinguish:

```text
Focused test passed
```

from:

```text
Full test suite passed
```

and:

```text
Live integration verification passed
```

These are different claims.

---

# 31. Build and Type Checking

For backend changes, relevant verification commonly includes:

```bash
pnpm exec tsc --noEmit
```

and:

```bash
pnpm build
```

Use the repository's actual package scripts and configuration where appropriate.

Do not claim build success without executing the build.

---

# 32. Database Verification

Before claiming database correctness, determine:

1. Which database is being used?
2. Is it local?
3. Is it test?
4. Is it staging?
5. Is it live/shared?
6. Which PostgreSQL role is being used?
7. Does the role have `BYPASSRLS`?
8. Which migrations are applied?
9. Are there pending migrations?
10. Is migration drift present?

A database test performed with a superuser does not necessarily prove application-role RLS correctness.

Where tenant isolation is involved, test using the same privilege model that the application actually uses whenever feasible.

---

# 33. Security-Sensitive Verification

For authorization, tenancy, RLS, invitation, MFA, CSRF, or identity-sensitive changes, verification must test both:

### Positive path

Authorized request succeeds.

### Negative path

Unauthorized/cross-tenant/invalid request fails safely.

Where applicable also verify:

* state remains unchanged after rejected requests;
* no sensitive information is leaked;
* replay behavior is correct;
* idempotency is preserved;
* audit/outbox evidence is generated;
* RLS is actually enforced;
* session/MFA requirements are respected.

---

# 34. Frontend Rules

Frontend code lives under:

```text
apps/web
```

When building forms:

### Select / enum fields

Always use:

```tsx
<FormSelect>
```

rather than a basic text:

```tsx
<FormField>
```

for enum/select inputs.

### Date fields

Use:

```tsx
<FormField inputProps={{ type: 'date' }}>
```

for dates.

Use:

```tsx
<FormField inputProps={{ type: 'datetime-local' }}>
```

for date/time values.

---

# 35. File Architecture

Follow the `single-responsibility-file-architecture` skill.

Avoid large "god files".

A file should have one focused responsibility.

Prefer explicit separation such as:

```text
controller
service
operations
dto
errors
module
contract
spec
```

Do not create unnecessary abstractions merely to satisfy a pattern.

Architecture must remain understandable to future agents.

---

# 36. API Contract Safety

Do not casually change:

* DTO contracts;
* response shapes;
* HTTP status semantics;
* permission names;
* policy names;
* error codes;
* audit event names;
* idempotency semantics;
* authentication behavior.

Before changing an existing contract:

1. find its consumers;
2. inspect tests;
3. inspect documentation;
4. determine whether it is an intentional breaking change;
5. document the impact.

---

# 37. Audit and Outbox Semantics

Where a feature requires audit or outbox evidence, do not consider the operation complete merely because the primary database row was created.

Verify the complete required transaction/semantic contract.

Do not silently remove audit events to make tests pass.

Do not silently make outbox operations best-effort when the feature contract requires durable evidence.

---

# 38. Idempotency

For endpoints requiring idempotency:

* preserve the documented idempotency-key format;
* ensure retries do not create duplicate state;
* distinguish replay from a new request;
* preserve the documented response semantics;
* test repeated requests.

Do not weaken idempotency merely to simplify implementation.

---

# 39. Authentication / OIDC

The application uses Keycloak/OIDC.

Where authentication flows are involved, preserve applicable requirements such as:

```text
PKCE S256
state
nonce
session cookie
CSRF protection
MFA assurance
AMR
ACR
MFA timestamp / freshness
```

Do not remove or weaken authentication checks merely because a test fixture is inconvenient.

---

# 40. Secrets and Sensitive Configuration

Never commit:

```text
passwords
API keys
tokens
private keys
client secrets
session secrets
database credentials
production credentials
```

Do not paste secrets into:

* logs;
* test snapshots;
* source code;
* documentation;
* Git commits;
* issue descriptions.

Use environment variables or the project's established secret mechanism.

---

# 41. When Verification Infrastructure Is Missing

If required infrastructure is unavailable:

**Do not fake the result.**

For example:

```text
PostgreSQL unavailable
```

means:

```text
database verification not performed
```

It does NOT mean:

```text
database verified
```

Similarly:

```text
Keycloak unavailable
```

means runtime OIDC verification is unavailable.

Report exactly what was and was not tested.

---

# 42. Mandatory Stop Conditions

The agent MUST stop implementation and report the blocker when:

* the canonical working directory is unavailable;
* the repository is not actually `/root/Mohamy-pro-backup`;
* required skills cannot be loaded;
* the previous phase's owner-approved delivery gate cannot be proven;
* repository state materially contradicts the task assumptions;
* uncommitted user work would be overwritten;
* migration history would need destructive modification;
* a security boundary would need to be weakened;
* required infrastructure is unavailable for a mandatory verification;
* a test fails and the cause is unknown;
* the agent cannot distinguish observed evidence from assumption;
* the requested implementation conflicts with an explicit deferred-scope decision;
* the requested change would require an unapproved breaking API/security/schema change.

When blocked, report:

```text
BLOCKED

Reason:
Evidence:
Impact:
What is required to continue:
```

Do not guess.

---

# 43. Conflict Resolution Between Instructions

When instructions conflict, use this priority order:

1. System/developer/platform safety instructions.
2. Explicit current user instruction.
3. Repository `AGENTS.md`.
4. Repository-local documentation and contracts.
5. Historical notes and prior agent claims.
6. Assumptions.

Never allow a historical note to override current repository evidence.

Never allow an assumption to override observed repository state.

---

# 44. Documentation Rules

When implementation changes behavior, update the relevant documentation when required.

Documentation must accurately distinguish:

```text
Implemented
Tested
Verified
Deferred
Not tested
Blocked
```

Do not use ambiguous wording such as:

```text
done
complete
works
safe
production-ready
```

without supporting evidence.

---

# 45. Final Response Requirements for Coding Agents

At the end of a task, provide a concise engineering report containing:

## Summary

What changed.

## Files Changed

List the files actually modified.

## Why

Explain the implementation decision.

## Verification

For each important command:

```text
Command:
CWD:
Exit code:
Result:
```

## Security / RLS

If applicable, explain what was verified.

## Database / Migration

State:

```text
Fresh DB tested: YES/NO
Upgrade path tested: YES/NO
Live DB tested: YES/NO
Migration status verified: YES/NO
```

## Remaining Risks

Explicitly state anything that remains unverified.

## Git

State:

```text
Branch:
Commit:
Working tree:
Remote synchronization:
```

Never fabricate any of these values.

---

# 46. Golden Rule

The repository must always be left in a state that another engineer or AI agent can safely continue from.

Therefore:

> **Do not guess. Do not hide failures. Do not bypass security boundaries. Do not rewrite history to make checks pass. Do not claim verification without execution evidence. Do not begin a phase without owner approval. Preserve existing work.**

When uncertain:

```text
STOP → INSPECT → VERIFY → EXPLAIN → THEN ACT
```

---

# 47. Current Canonical Repository

For avoidance of doubt, the authoritative repository is:

```text
/root/Mohamy-pro-backup
```

The authoritative Git remote is:

```text
https://github.com/elnewahy2025/Mohamy-pro.git
```

The stale imported worktree is:

```text
/root/imported-project/...
```

and MUST NOT be used as the project's source of truth.

**All agents must follow this contract.**

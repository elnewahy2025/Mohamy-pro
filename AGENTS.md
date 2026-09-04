# AGENTS.md — Agent Instructions

## Canonical Working Directory

The canonical, single source of truth for this repository is:

```
/root/Mohamy-pro-backup
```

This is the full clone that is synced to the GitHub remote `elnewahy2025/Mohamy-pro`
(branch `main`). **All** git operations (commit, push, pull, checkout), code edits, skill
loading, and verification MUST be performed from this directory.

### Rules

1. **Never** operate on the stale worktree `/root/imported-project/...` (a truncated,
   upper case `Docs/` snapshot from an older lineage). It is not the source of truth.
2. **Never** run `git` operations or read/write code from any checkout other than
   `/root/Mohamy-pro-backup`.
3. If you are inside any other working directory, relocate to `/root/Mohamy-pro-backup`
   before reading or editing repository files.

## Mandatory Skills

Load and apply BOTH of the following skills (installed globally at `~/.agents/skills/`)
before any implementation, debugging, refactoring, testing, security, or review task:

- `engineering-governance` — evidence-based governance; never claim a result is verified
  unless the command was actually executed (record command, cwd, exit code, result).
- `single-responsibility-file-architecture` — strict file-level separation of
  responsibilities; one focused responsibility per file.

Use the `skill` tool with these names. If they are not visible in `<available_skills>`,
they may not have been registered for the current session — read their `SKILL.md` from
`~/.agents/skills/<name>/SKILL.md` directly and apply them.

## Relevant Global Skills (available on this host)

Additional skills are installed globally and are relevant to this project as the workstream
covers them. Load via the `skill` tool (or read the `SKILL.md` directly if not registered).
Current task is a backend legal app — frontend/design skills apply only to future UI work.

| Skill | Path | Applies when |
|---|---|---|
| `engineering-governance` | `~/.agents/skills/engineering-governance/SKILL.md` | **Mandatory** — implementation/debug/test/review (backend) |
| `single-responsibility-file-architecture` | `~/.agents/skills/single-responsibility-file-architecture/SKILL.md` | **Mandatory** — creating/refactoring code |
| `vercel-composition-patterns` | `~/.agents/skills/vercel-composition-patterns/` | React component composition (future frontend) |
| `vercel-react-best-practices` | `~/.agents/skills/vercel-react-best-practices/` | React/Next.js performance (future frontend) |
| `web-design-guidelines` | `~/.agents/skills/web-design-guidelines/SKILL.md` | UI accessibility/design review (future frontend) |

> **Prettier is a tool, not a `skill`** — see the **Prettier Setup** section below for config,
> the exact `--check`/`--write` commands, the `EBADDEVENGINES` workaround (use
> `./node_modules/.bin/prettier` directly, never `npm run format`), and the gate that every
> touched backend `.ts` file must be prettier-clean before commit.

Other globally-installed skills (see `~/.claude/skills/shared_skills/` and
`~/.opencode/skills/shared_skills/`): `android`, `anyclaw-publish`, `composio-cli`,
`flightclaw`, `search-codex-chats`, `telegram-bridge-send`, `twitter-auto-post-shizuku` —
unrelated to this legal backend; ignore unless the task explicitly involves them.
`~/.claude/skills/installed-skills.json` lists ~35 enabled skills (data-viz, github,
stripe/supabase, sentry, etc.); load only if a task matches them.

## Data Safety

Preserve the user's work unconditionally. Never delete or overwrite repository content
without confirmation. When in doubt about whether data will be lost, create an offline
tarball backup first under `/root/safety-backups/`.

## GitHub Remote & Git Workflow

- Remote: `https://github.com/elnewahy2025/Mohamy-pro.git`, branch `main`.
- The owner (author `Khaled Osman`) pushes directly to `origin/main`. **Always** `git fetch`
  and `git pull --rebase` before pushing; if origin moved ahead, review the new commits first.
- Confirm cleanup: after a push, verify `git rev-parse main == git rev-parse origin/main` and a
  clean working tree (`git status -sb`).
- Follow the forced-phase rule (`Plan.txt` line 1297): do not begin a phase's code until the
  previous phase's delivery-review gate is owner-approved.

## Current Project State (Tracked in this Repo)

Backend: `backend/api` (NestJS + Prisma). Phases delivered as additive migrations + permission
seeds + audit events + a focused module. Tenancy: composite `@@unique([id, tenantId])`,
RLS `FORCE ..._tenant_isolation` via `app_tenant_context_is_valid()`, service layer uses
`withTenantContext`. Each module has `*.operations.ts` (shared `authorize`/`run`/`read`),
`*.service.ts`, `*.controller.ts`, `*.dto.ts`, `*.errors.ts` (non-enumerating),
`*.module.ts` (imports `AuthModule` when it uses guards), and specs.

- **Phase 4** — Organization Configuration engine (`20260902120000_...`). Sealed.
- **Phase 5** — Client Management (`Client`/`ClientContact`/`ClientAddress`,
  `CanManageClients`, `clients/` module, `20260902180000_...` + `20260902190000_...`). Sealed.
- **Phase 6** — Conflict Check Foundation (`ConflictCheck`/`ConflictParty`, `CanManageConflictChecks`,
  `conflict-checks/` module, `20260903100000_...`). Gate contract: `ConflictGateService.assertClearForCase`
  returns `GateVerdict { cleared, blocks, reasons }` (does NOT throw). Sealed.
- **Phase 7** — Party Management (`Party`/`PartyRole`/`PartyRelationship`, `CanManageParties`,
  `parties/` module, `20260904100000_...`). `CaseParty` linking contract lives in
  `src/parties/case-party.contract.ts` (`CasePartyLinker`/`CasePartyLink`). Sealed.
- **Phase 8** — Case Management (`Case`/`CaseParty`, `CanManageCases`, `cases/` module,
  `20260904120000_...`). Sealed. `case.service.ts` calls `ConflictGateService.assertClearForCase`
  and throws `CaseGateRejectionError` on block.
- **Phase 9** — Legal Configuration (`Country`/`Jurisdiction`/`Court`/`CourtLocation`,
  `CanManageLegalConfig` + `CanManageGlobalLegalConfig`, `legal-config/` module,
  `20260904150000_...`). **Hybrid tenancy**: `tenantId` is nullable — `NULL` = global dictionary,
  concrete value = tenant-scoped. RLS `FORCE` policies allow global (`tenantId IS NULL`) +
  own-tenant reads and tenant-scoped writes; `LegalConfigOperations.requireParentVisible`
  prevents attaching a child to another tenant's parent. Delivered (create + list).
- **Phase 10** — Case Timeline (`CaseTimelineEvent`, `CanViewCaseTimeline`, `case-timeline/`
  module, `20260904160000_...`). Delivered. RLS `FORCE` + `_tenant_isolation`.
- **Phase 11** — Workflow Engine definition/storage (`Workflow`/`WorkflowVersion`/
  `WorkflowState`/`WorkflowTransition`, `CanManageWorkflows`, `workflows/` module,
  `20260905100000_...`). **Storage only** — execution engine deferred (recorded, not silent).
  RLS `FORCE` + `_tenant_isolation`.
- **Phase 12** — Hearing Management (`Hearing`, `CanManageHearings`, `hearings/` module,
  `20260906100000_...`). Delivered. Internal-calendar/attendee aggregation deferred.
  RLS `FORCE` + `_tenant_isolation`.
- **Phase 13** — Legal Deadline Engine (`DeadlineRule`/`Deadline`, `CanManageDeadlines`,
  `deadlines/` module, `20260906120000_...`). CRUD delivered; computation engine deferred.
  RLS `FORCE` + `_tenant_isolation`.
- **Phase 14** — Task Management (`Task`/`TaskChecklist`/`TaskDependency`, `CanManageTasks`,
  `tasks/` module, `20260906140000_...`). Delivered. RLS `FORCE` + `_tenant_isolation`. Child
  tables (`TaskChecklist`, `TaskDependency`) got `tenantId` via `20260907000000_...`.
- **Phase 15** — Document Management (`Document`/`DocumentVersion`/`DocumentTag`/
  `DocumentMetadata`/`DocumentShare`/`DocumentAccess`, `CanManageDocuments`, `documents/`
  module, `20260906150000_...`). **Metadata/CRUD only** — real object storage deferred
  (security-sensitive, recorded not silent). RLS `FORCE` + `_tenant_isolation`. Child tables
  got `tenantId` via `20260907000000_...`.
- **Phase 10–15 remediation (R0–R10)** — see `docs/AUDIT_REMEDIATION_PHASES_10_15.md`.
  Cross-cutting: `20260905100000` workflow migration repaired in place (un-applied chain);
  `20260907000000_phase10_15_rls_isolation` adds `tenantId` to 7 child tables and FORCE-RLS on
  all 16 Phase 10-15 tables; `20260907010000_phase10_15_permission_seal` seals the 6
  Phase-10-15 permissions; `reconcileBuiltInRoles` runs at startup; all 6 controllers use
  `@UseGuards(SessionGuard, CsrfGuard)`; cross-tenant attach guards via `requireVisible`; audit
  allowlist expanded + `workflow.version.created` added. Status: implemented + gated
  (tsc=0, nest build=0, prettier clean, 322/322 jest tests), **not yet applied to a live DB**
  (no PostgreSQL in this env) — a fresh-DB `prisma migrate deploy` is release-gating.

## Prettier Setup (shared with other agents)

Prettier is the code formatter for **backend TypeScript modules only**. Markdown docs are
NOT prettier-formatted (repo convention across Phases 4-8) — their wrap/reflow is authored by
hand and must not be rewritten with prettier.

- **Config**: `backend/api/.prettierrc` (tracked in git):
  `{ "singleQuote": true, "trailingComma": "all" }`
- **Workdir**: every command runs from `backend/api`.
- **Check**: `./node_modules/.bin/prettier --check "src/**/*.ts" "test/**/*.ts"`
- **Format**: `./node_modules/.bin/prettier --write "src/**/*.ts" "test/**/*.ts"`
  (equivalent to the `format` npm script; use the direct binary path to avoid pnpm/npm
  EBADDEVENGINES issues — see below).
- **Gate**: any touched backend `.ts` file must be prettier-clean before commit. The full
  `prettier --check` on `src/**/*.ts` `test/**/*.ts` must pass.

### Invocation note for agents

Do NOT run `npm run format` or `npx prettier` — npm errors with `EBADDEVENGINES`. Use the
direct binary: `./node_modules/.bin/prettier ...` from `backend/api`. Run `--check` first,
then `--write` only the files you changed (do not reformat unrelated/untouched files).

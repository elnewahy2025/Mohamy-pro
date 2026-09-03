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
  `20260904120000_...`). **STATUS: in progress — see warning below.** `case.service.ts` correctly
  calls `ConflictGateService.assertClearForCase` and throws `CaseGateRejectionError` on block.

> **WARNING (2026-09-03):** `origin/main` HEAD (`9fe8ce37`, Phase 8) currently **fails `tsc --noEmit`**:
> `src/cases/*` references three not-yet-existing modules (`../auth/app-session.guard`,
> `../auth/app-session.context`, `../audit/audit-log.service`), uses `MEDIUM` (not in `CasePriority`
> enum, which is `LOW|NORMAL|HIGH|URGENT`), and writes `caseParty.partyRoleId` while the schema
> column is `roleId`. These must be resolved before Phase 8 can be considered passing.

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

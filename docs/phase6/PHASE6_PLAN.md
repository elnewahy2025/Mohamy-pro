# Phase 6 Plan — Conflict Check Foundation (Core Delivery)

**Plan status:** DRAFT for owner review. Execution authorized only after the Phase 5
completion gate (`[x] Approved` at `b3f4e4a6`) — which is already sealed — and owner sign-off
on this plan.

**Plan date:** 2026-09-03

**Repository revision at reconciliation:** `main` === `origin/main` === `9c54e37d` (clean tree;
plan refined by owner on top of sealed Phase 5 gate `b3f4e4a6`).

**Governing phase rules (enforced):**
- `Plan.txt` line 1260 — Phase 6 is `Conflict Check Foundation`. Forced-phase rule
  (`Plan.txt` line 1297): Phase 6 must not begin before Phase 5 closure is fully approved.
  Phase 5 gate is sealed (`b3f4e4a6` `[x] Approved`).
- `Plan.txt` §354-380 — Phase 6 objective/scope/outputs/closing conditions.
- `Plan.txt` line 44 — `conflict check foundation يجب أن يبدأ قبل acceptance لأي matter/case`
  (conflict check foundation must begin before acceptance of any matter/case).
- AGENTS.md: additive migrations only; tenant isolation enforced in both the application layer
  (`prisma.withTenantContext`) and database layer (RLS `FORCE`); tsc 0, prettier clean, full jest
  pass as gates; ask owner on ambiguity.
- single-responsibility-file-architecture skill: each responsibility in its own focused file.
- Owner-scoped first-delivery precedent from Phase 4 (settings engine) and Phase 5 (client
  CRUD + list, contacts/addresses), each a bounded gate-approvable core. Phase 6 follows suit.

## Objective

Implement the **Conflict Check Foundation** from `Plan.txt` (§354-380) as a bounded,
gate-approvable core delivery:

1. A tenant-scoped **`ConflictCheck`** entity graph capturing a request-to-decision workflow:
   Requester, Client (optional), prospective **Parties** / **Related Entities** as normalized
   inputs, Reviewer, **Decision**, **Reason**, and **Audit**.
2. A **deterministic match mechanism now** — checking prospective party names/emails against
   the tenant's existing `Client` (`displayName`) and `ClientContact` (`value`) rows via
   normalized string equality/substring. Full-text **search-backed analysis** is genuinely
   unavailable (the Search engine is `Phase 19`), so it is **deferred**, recorded not silent.
3. A reusable **acceptance-gate decision contract** — a service method
   `assertClearForCase(prospectiveParties)` that a future Matter/Case acceptance flow
   (Phase 7/8) will invoke. The check carries a single authoritative review decision
   (`ALLOW`/`BLOCK`); any final `BLOCK` decision conservatively means the check is **not** clear,
   per the conservative conflicts posture; the decision and reason are audit-logged.
4. Guarded by a single **`CanManageConflictChecks`** permission key (owner-approved single-key
   model, mirroring `CanManageClients`), enforced in-app via `assertTenantPermission` and at rest
   via RLS.

**Deliberately deferred (sequenced, recorded not silent):**
- Wired enforcement on Matter/Case acceptance (no `Case`/`Matter` entity exists until Phase 8;
  no acceptance flow until Phase 8/29). This delivery ships the **reusable gate contract**, not
  the case wiring.
- Historical Matters evaluation (no `Matter` entity exists until Phase 8).
- Search-backed conflict analysis (requires the Phase 19 search engine).
- Party Management linkage (Parties are modeled as normalized inputs now; the `Party`/`CaseParty`
  entity arrives in Phase 7).
- Reviewer workflow UI and intake integration (Phase 7/8/29).

## Reconciliation (evidence-based snapshot at `9c54e37d`)

### Reused primitives (verified present)

| Primitive | Location |
|---|---|
| TEXT id / tenant scoping / `@@unique([id, tenantId])` / `@@index([tenantId, status])` | `schema.prisma` (Client `20260902180000`, Tenant 259, ...) |
| `HierarchyStatus` enum (`ACTIVE`/`ARCHIVED`) + soft-archive precedent | `schema.prisma:24-26`; `clients/`
| RLS `FORCE ..._tenant_isolation` policy + `app_tenant_context_is_valid()` helper | `migrations/20260822200000_rls_tenant_context_foundation/migration.sql:15-27` |
| `withTenantContext` (sets `app.tenant_*` session vars) | `src/infrastructure/database/prisma.service.ts:61-71,143-154` |
| Single-key permission recipe (constant + catalog + role grant + migration seed + `reconcileBuiltInRoles`) | `src/permissions/permission.constants.ts`; `permissions.service.ts`; migration seeds `20260902120000...` :56-64, `20260902180000...` |
| `assertTenantPermission` → `{ membershipId }` | `src/permissions/permissions.service.ts:57-79` |
| Audit 4-maps + `METADATA_ALLOWLIST` + completeness guard test | `src/audit/audit-constants.ts`; `audit-event.service.ts:36-73`; `audit-event.service.spec.ts:12-18` |
| `ClientOperations` shared authorize/run + `requireClientInTenant` | `src/clients/client.operations.ts` |
| Single-responsibility module layout (service/controller/dto/errors/spec, `AuthModule` DI) | `src/clients/`; module imports `AuthModule` |
| `PaginationDto` (page/limit, `@Max(100)`) + `Paginated` envelope | `src/common/api/pagination.dto.ts`; `success-envelope.interceptor.ts:39-48` |
| `Client` model + `ClientContact` (match sources for deterministic scan) | `schema.prisma` (Client, ClientContact/ClientAddress `20260902190000`) |

### Genuinely new (this delivery)

| Item | Gap |
|---|---|
| `ConflictCheck` + `ConflictParty` (normalized inputs) Prisma models + additive RLS migration | no conflict model exists |
| `CanManageConflictChecks` permission (constant/catalog/role/seed) | new key + migration seed |
| `conflict.check.created/in_review/decided` audit events (4 maps + allowlist) | new event types |
| `conflict-checks/` module (operations/service/controller/dto/errors/spec) mirroring `clients/` | new module |
| Deterministic match service (scan `Client.displayName` + `ClientContact.value` vs normalized party inputs) | net-new matching logic |
| Acceptance-gate decision contract (`assertClearForCase`, single-final-decision semantics + audit) | net-new; wired to Matter/Case in Phase 7/8 |

## Delivery workstreams

### W1 — Schema: `ConflictCheck` + `ConflictParty` models + additive migration
- New `ConflictCheckStatus` enum (`PENDING`, `IN_REVIEW`, `COMPLETED`) and
  `ConflictDecision` enum (`PENDING`, `ALLOW`, `BLOCK`).
- `model ConflictCheck`: `id`, `tenantId`, `status`, `requesterUserId`, optional `clientId`
  (the client the check is run for), `prospectiveParties` (denormalized snapshot for audit),
  `decision`, `reason` (nullable TEXT), `reviewerUserId` (nullable), `reviewedAt` (nullable),
  `createdAt`/`updatedAt`; `tenant` relation `onDelete: Restrict`. Additive indexes
  `@@unique([id, tenantId])`, `@@index([tenantId, status])`.
- `model ConflictParty`: `id`, `tenantId`, `conflictCheckId`, `kind`
  (`PARTY`/`RELATED_ENTITY`), `name`, `normalizedName`, optional `email`, FK→ConflictCheck
  `onDelete: Cascade`; `@@unique([id, tenantId])`, `@@index([tenantId, conflictCheckId])`.
- Additive migration (`20260903100000_conflict_check_foundation`): CREATE TABLE ConflictCheck,
  CREATE TABLE ConflictParty, `FORCE RLS` + `_tenant_isolation` policies on both, idempotent
  `CanManageConflictChecks` permission seed.

### W2 — Permissions + audit wiring
- `PERMISSION_KEYS.CAN_MANAGE_CONFLICT_CHECKS = 'CanManageConflictChecks'`; add to
  `PERMISSION_CATALOG` and `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]`.
- New audit event types `conflict.check.created`, `conflict.check.in_review`,
  `conflict.check.decided` across all four maps; `METADATA_ALLOWLIST` entries
  (`created: ['kind']`, `in_review: []`, `decided: ['decision']`) so the completeness guard test
  passes. Never audit sensitive party contact values on the allowlist.

### W3 — `conflict-checks/` module (mirror `clients/`)
- `conflict-checks.module.ts` imports `AuthModule`; `conflict-check.errors.ts` non-enumerating
  `FORBIDDEN` (`ConflictCheckAccessDeniedError`).
- `conflict-check.operations.ts` shared `authorize` + `run` (tenant context + atomic audit),
  mirroring `clients/client.operations.ts`.
- `conflict-check.service.ts` (`request/create`, `startReview`, `decide`) + `service.spec.ts`.
- `conflict-check.controller.ts` routes `POST /conflict-checks`, `GET /conflict-checks`,
  `GET /conflict-checks/:id`, `POST /conflict-checks/:id/review`, `POST /conflict-checks/:id/decide`
  all `@UseGuards(SessionGuard, CsrfGuard)`; `conflict-check.dto.ts` (create/list/review/decide DTOs,
  list extends `PaginationDto`).

### W4 — Deterministic match + decision contract
- `conflict-match.service.ts`: normalize prospective party name/email inputs; scan
  `Client.displayName` (case-insensitive) and `ClientContact.value` (PHONE/EMAIL) within the
  active tenant; return matched `Client` references with a reason. Explicitly **not**
  search-backed (deferred to Phase 19).
- `conflict-gate.service.ts`: the acceptance-gate contract. `assertClearForCase(prospectiveParties)`
  runs the match + the check's final decision; returns `{ cleared: boolean, blocks: [...], reasons: [...] }`.
  Conservative semantics: a final `BLOCK` decision against a matched party means the check is **not**
  clear. Emits `conflict.check.decided` audit. Phase 7/8 will invoke this before accepting a
  new matter/case (wired later, recorded not silent).

### W5 — Gates
- `tsc --noEmit` = 0; `prisma validate` clean; prettier clean (my modules; pre-existing repo
  prettier warnings untouched); full jest pass (manual constructor composition; coverage thresholds
  met). Add conflict-check + match + gate specs.

### W6 — Docs
- Author this plan; at delivery author `PHASE6_CORE_DELIVERY_REVIEW.md` and update this file's
  completion gate section; record explicit deferrals.

## Closing conditions (mirror Plan.txt §378-380, bounded to this delivery)

1. A user with `CanManageConflictChecks` can request a conflict check, add/confirm prospective
   parties (and related entities), start review, and record a decision (`ALLOW`/`BLOCK`) with a
   reason.
2. The deterministic match surfaces existing tenant clients/contacts that collide with a
   prospective party (name/email), so a reviewer has evidence for the decision.
3. The acceptance-gate contract `assertClearForCase` returns a non-enumerating
   `{ cleared, blocks }` verdict the future Matter/Case acceptance flow will enforce — and a final
   BLOCK decision yields `cleared: false`.
4. Conflict checks are only reachable within the correct permissions: `403 FORBIDDEN` for
   unauthenticated / missing-tenant / no-permission; RLS `FORCE` prevents cross-tenant reads.
5. Phase 6 gate is owner-approved before any Phase 7 (Party Management) work.

## Explicit deferrals (recorded, not silent)

- **Matter/Case acceptance wiring** — the `assertClearForCase` contract ships now; calling it from
  a Matter/Case acceptance flow is impossible until Phase 7/8 create the Case/Matter entity and
  intake. Wired in Phase 7/8.
- **Historical Matters evaluation** — impossible to evaluate historical matters until the `Matter` entity exists (Phase 8).
- **Search-backed conflict analysis** — requires the Phase 19 search engine; deterministic
  normalization matching serves the foundation now.
- **Party/Role linkage** — `ConflictParty` is a normalized snapshot; the `Party`/`CaseParty`/
  `PartyRole` entities arrive in Phase 7.
- **Reviewer workflow UI / intake integration** — backend-first (mirrors Phase 4/5); UI and intake
  hooks land in Phase 7/8/29.
- **Retention/legal-hold of conflict records** — Phase 30 scope.

## Risks / notes

- **No Case/Matter yet** — this is the core tension of a "foundation." The decision contract is the
  durable surface; the enforcement call site is staged into Phase 7/8 to avoid pre-empting their
  design (owner-approved scoping).
- **Matching is deterministic, not semantic** — a matched name/email is a *flag*, not a definitive
  conflict; the reviewer's decision (with reason + audit) is authoritative. This stays true when
  search-backed analysis arrives in Phase 19.
- **Conservative posture** — a final `BLOCK` decision makes the check not clear; this is the
  defensible default for a conflicts process and is documented in the gate contract.
- DB reachability for the migration apply / drift check is the owner's responsibility (as in Phases
  4/5); the migration is hand-authored to codebase conventions and flagged for `prisma migrate diff`
  verification.

## References

- `Plan.txt` §354-380 (Phase 6), line 44 (conflict foundation before matter/case acceptance),
  line 1260 (phase order), line 1297 (forced-phase rule)
- `docs/phase5/PHASE5_PLAN.md` (plan format + precedent)
- `docs/phase5/PHASE5_COMPLETION_REVIEW.md` (sealed Phase 5 gate `b3f4e4a6` `[x] Approved`)
- `docs/phase4/PHASE4_COMPLETION_REVIEW.md` (sealed Phase 4 gate `1d0b4fd2`)
- `docs/phase4/PHASE4_AUDIT_CONCLUSION.md` (engine-reuse direction)
- single-responsibility-file-architecture skill
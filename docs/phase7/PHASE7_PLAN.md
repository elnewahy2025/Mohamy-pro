# Phase 7 Plan — Party Management (Core Delivery)

**Plan status:** DRAFT for owner review. Execution authorized only after the Phase 6 closure
(the owner approved the Phase 6 plan `f7443945`, the edge-case fix `59eae1e7`, and directed
"proceed with phase 7") and owner sign-off on this plan.

**Plan date:** 2026-09-03

**Repository revision at reconciliation:** `main` === `origin/main` === `59eae1e7` (clean tree).

**Governing phase rules (enforced):**
- `Plan.txt` line 1261 — Phase 7 is `Party Management`. Forced-phase rule (`Plan.txt` line 1297):
  Phase 7 must not begin before Phase 6 closure is fully approved. Phase 6 is approved by the
  owner (plan + delivery + edge-case fix); the Phase 6 delivery-review box is noted below.
- `Plan.txt` §382-399 — Phase 7 objective/scope/outputs/closing conditions.
- AGENTS.md: additive migrations only; tenant isolation enforced in both the application layer
  (`prisma.withTenantContext`) and database layer (RLS `FORCE`); tsc 0, prettier clean, full jest
  pass as gates; ask owner on ambiguity.
- single-responsibility-file-architecture skill: each responsibility in its own focused file.
- Owner-approved first-delivery precedent from Phases 5/6: a bounded, gate-approvable core with
  deferred, recorded-not-silent follow-ups. Phase 7 follows suit.

## Objective

Implement the **Party Management** foundation from `Plan.txt` (§382-399) as a bounded,
gate-approvable core delivery:

1. A tenant-scoped **`Party`** entity that separates a **legal counterparty** from a `Client`
   and supports any legal structure (person/entity), with an optional link to an existing
   `Client` and a soft-archive (`HierarchyStatus`).
2. **`PartyRole`** — a **configurable** role catalog (tenant-scoped, seeded with the default
   roles plaintiff / defendant / claimant / respondent / witness / expert / company / government /
   other). Role assignment is case-specific and belongs to the deferred `CaseParty` model.
3. **`PartyRelationship`** — tenant-scoped party-to-party links (spouse, subsidiary, related
   entity, etc.).
4. A **`CaseParty` linking contract** — a typed, documented, unit-tested reusable contract that
   Phase 8's `Case`/`Matter` entity will invoke to link parties to a case. Because no `Case`
   entity exists until Phase 8, the physical `CaseParty` table is deferred; the contract surface
   and semantics ship now (recorded not silent).

**Deliberately deferred (sequenced, recorded not silent):**
- Physical `CaseParty` table + wiring to `Case`/`Matter` (Phase 8). This delivery ships the
  reusable linking contract, not the case wiring.
- Config-catalog promotion of roles (roles are seeded defaults; free-form custom roles supported;
  catalog promotion to `OrganizationSetting` deferred).
- Frontend party UI (backend-first, mirrors Phases 4/5/6).

## Reconciliation (evidence-based snapshot at `59eae1e7`)

### Reused primitives (verified present)

| Primitive | Location |
|---|---|
| TEXT id / tenant scoping / `@@unique([id, tenantId])` / `@@index([tenantId, status])` | `schema.prisma` (Client, ConflictCheck) |
| `HierarchyStatus` enum (`ACTIVE`/`ARCHIVED`) + soft-archive precedent | `schema.prisma:24-26`; `clients/`, `conflict-checks/` |
| RLS `FORCE ..._tenant_isolation` policy + `app_tenant_context_is_valid()` helper | `migrations/20260822200000_rls_tenant_context_foundation/migration.sql:15-27` |
| `withTenantContext` (sets `app.tenant_*` session vars) | `src/infrastructure/database/prisma.service.ts:61-71,143-154` |
| Single-key permission recipe + `assertTenantPermission` + `reconcileBuiltInRoles` | `permission.constants.ts`; `permissions.service.ts:57-79`; migration seeds |
| Audit 4-maps + `METADATA_ALLOWLIST` + completeness guard test | `audit-constants.ts`; `audit-event.service.ts:36-73`; `audit-event.service.spec.ts` |
| Shared ops helper (`authorize` + `run` + `read` + `requireClientInTenant`) | `src/conflict-checks/conflict-check.operations.ts` |
| Single-responsibility module layout + `AuthModule` DI | `src/conflict-checks/`, `src/clients/` |
| `PaginationDto` + `Paginated` envelope | `src/common/api/pagination.dto.ts`; `success-envelope.interceptor.ts` |
| `Client` model (optional `clientId` link source for Party) | `schema.prisma` |

### Genuinely new (this delivery)

| Item | Gap |
|---|---|
| `Party` + `PartyRole` + `PartyRelationship` models + additive RLS migration | new models |
| `CanManageParties` permission (constant/catalog/role/seed) | new key + migration seed |
| `party.*` and `party_role.*`/`party_relationship.*` audit events (4 maps + allowlist) | new event types |
| `parties/` module (ops/service/controller/dto/errors/spec) mirroring `conflict-checks/` | new module |
| `CaseParty` linking contract (typed surface + unit-tested semantics) | net-new; wired to Case/Matter in Phase 8 |

## Delivery workstreams

### W1 — Schema + additive migration (`20260904100000_party_management_foundation`)
- New enums: `PartyType` (`PERSON`/`ORGANIZATION`), `PartyStatus` (reuse `HierarchyStatus`).
- `model Party`: `id`, `tenantId`, `partyType`, `name`(person)/`legalName`(org), `displayName`
  (denormalized, searchable), `status HierarchyStatus @default(ACTIVE)`, optional `clientId`
  (link to a `Client`, FK onDelete Restrict + tenant guard), `notes`, timestamps;
  `@@unique([id, tenantId])`, `@@index([tenantId, status])`.
- `model PartyRole`: `id`, `tenantId`, `key` (stable, tenant-unique), `label`,
  `status HierarchyStatus @default(ACTIVE)`, timestamps;
  `@@unique([tenantId, key])`.
- `model PartyRelationship`: `id`, `tenantId`, `fromPartyId`, `toPartyId`, `relationshipType`
  (free-form TEXT), `status`, timestamps; FKs onDelete Restrict + tenant guard;
  `@@unique([id, tenantId])`, `@@index([tenantId, fromPartyId])`.
- Additive migration: CREATE the three tables, `FORCE RLS` + `_tenant_isolation` on each, seed
  idempotently the default `PartyRole` rows (plaintiff, defendant, claimant, respondent, witness,
  expert, company, government, other) per tenant marker, and the `CanManageParties` permission.

### W2 — Permissions + audit
- `PERMISSION_KEYS.CAN_MANAGE_PARTIES = 'CanManageParties'`; add to `PERMISSION_CATALOG` and
  `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]`.
- New audit events `party.created`, `party.updated`, `party.archived`, and for the linking surface
  `party.relationship.created` across all four maps; `METADATA_ALLOWLIST`
  entries so the guard test passes. Never audit sensitive party identifiers on the allowlist.

### W3 — `parties/` module (mirror `conflict-checks/`)
- `parties.module.ts` imports `AuthModule`; `party.errors.ts` non-enumerating
  `PartyAccessDeniedError`.
- `party.operations.ts` shared `authorize` + `run` + `read` + `requirePartyInTenant`.
- `party.service.ts`: `create` (with optional `clientId`), `update`, `archive`, `get`,
  `list` (search/status/partyType filters, paginated); `party-role.service.ts`: list roles;
  `party-relationship.service.ts`: create/list relationships.
- `party.controller.ts` routes `POST/GET /parties`, `GET/PATCH/DELETE /parties/:id`,
  plus role/relationship sub-resources — all `@UseGuards(SessionGuard, CsrfGuard)`; DTOs extend
  `PaginationDto`.

### W4 — `CaseParty` linking contract
- `case-party.contract.ts`: typed surface `CasePartyLink` (caseId, partyId, roleId(s), timestamps)
  + a `CasePartyLinker` abstract/interface describing `linkPartyToCase`, `unlinkPartyFromCase`,
  `listPartyRolesForCase` with documented tenant-scoping (RLS) and audit semantics.
- `case-party.contract.spec.ts`: unit-tests the documented semantics (tenant scoping, role
  validation, one-primary-role rule) against a mock transaction, so Phase 8 can implement the
  concrete table + wiring against a known contract.
- Explicitly **not** creating the physical `CaseParty` table (no `Case` entity yet).

### W5 — Gates
- `tsc --noEmit` = 0; `prisma validate` clean; prettier clean (my modules; pre-existing repo
  prettier warnings untouched); full jest pass (manual constructor composition). Add party +
  participation + contract + relationship specs.

### W6 — Docs
- Author this plan; at delivery author `PHASE7_CORE_DELIVERY_REVIEW.md` and record explicit
  deferrals.

## Closing conditions (mirror Plan.txt §396-399, bounded to this delivery)

1. A user with `CanManageParties` can create a Party (person or organization), optionally link it
   to a `Client`, assign configurable roles, and record party-to-party relationships.
2. Parties are only reachable within the correct permissions: `403 FORBIDDEN` for unauthenticated /
   missing-tenant / no-permission; RLS `FORCE` prevents cross-tenant reads.
3. The `CaseParty` linking contract is defined and unit-tested so Phase 8 can wire party↔case
   links; the case does **not** depend on plaintiff/defendant-only hardcoding once Phase 8 lands.
4. Phase 7 gate is owner-approved before any Phase 8 (Matter / Case Management) work.

## Explicit deferrals (recorded, not silent)

- **Physical `CaseParty` table + Case wiring** — Phase 8 (no `Case`/`Matter` entity exists yet).
- **Config-catalog promotion of party roles** — roles are seeded defaults; free-form custom roles
  supported now, catalog promotion via `OrganizationSetting` deferred.
- **Frontend party UI** — backend-first (mirrors Phases 4/5/6).
- **Retention/legal-hold of party data** — Phase 30.

## Risks / notes

- **No Case/Matter yet** — same core tension as Phase 6; the `CaseParty` linking contract is the
  durable surface, enforced in Phase 8 to avoid pre-empting its design (owner-approved scoping).
- **Party vs Client separation** — a Party is a legal role-holder entity that may (optionally)
  reference an existing Client; a Party is never a Client-equivalent, preserving the
  client/party boundary `Plan.txt` demands.
- **Configurable roles** — the default role set satisfies the listed roles; the `key` is
  tenant-unique so practices can add custom roles without hardcoding.
- DB reachability for the migration apply / drift check is the owner's responsibility (as in
  Phases 4/5/6); the migration is hand-authored to codebase conventions and flagged for
  `prisma migrate diff` verification.

## References

- `Plan.txt` §382-399 (Phase 7), line 1261 (phase order), line 1297 (forced-phase rule)
- `docs/phase6/PHASE6_PLAN.md` + `PHASE6_CORE_DELIVERY_REVIEW.md` (Phase 6 precedent + gate)
- `docs/phase5/PHASE5_PLAN.md` (plan format + precedent)
- single-responsibility-file-architecture skill
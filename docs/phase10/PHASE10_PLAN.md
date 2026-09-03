# Phase 10 Plan — Case Timeline (Core Delivery)

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off on this plan.

**Plan date:** 2026-09-03

**Governing phase rules (enforced):**

- `Plan.txt` line 1264 — Phase 10 is `Case Timeline`. Forced-phase rule applies.
- `Plan.txt` §482-497 — Phase 10 objective/scope (verbatim positions captured below).
- AGENTS.md: additive migrations only; tenant isolation enforced in both the application layer
  (`prisma.withTenantContext`) and database layer (RLS `FORCE`); tsc 0, prettier clean, full jest
  pass as QA gates; ask owner on ambiguity.
- single-responsibility-file-architecture skill: each responsibility in its own focused file.
- Bounded, gate-approvable core delivery with sequenced, recorded-not-silent deferrals.
- Set-up: Prisma client must be regenerated and committed alongside the migration (the schema and
  the generated client must stay in lock-step so the repo compiles as-pulled).

## Objective

Implement the **Case Timeline** foundation from `Plan.txt` as a bounded, gate-approvable core
delivery. `Plan.txt` §485 defines the objective verbatim: a **unified, dated, append-only timeline
for everything relevant to a case**, with a **unified event schema**, a **timeline projection**, and
**audit-friendly history** that cannot be altered "as if it never happened".

Plan.txt §509 / §451 (Phase 8 closing conditions carried forward): *every significant change must be
reflected in both the timeline and the audit log.*

### Event catalog (Plan.txt §487-489, "النطاق")

The scope enumerates the following canonical append-only timeline events:

1. Case Created
2. Client Added
3. Party Added
4. Document Uploaded
5. Task Created
6. Hearing Scheduled
7. Deadline Created
8. Status Changed
9. Note Added
10. Invoice Created
11. Payment Received
12. Document Approved
13. Case Closed

### Bounded core delivery (recommended scope)

To keep Phase 10 gate-approvable without depending on phases not yet built (11-21), the core
delivery ships:

1. A tenant-scoped **`CaseTimelineEvent`** table (append-only) with a unified event schema and a
   stable event-type enum covering the full catalog above.
2. **Write integration (source adapters) for events that exist today**: `case.created`,
   `case.updated`/`case.status_changed`, `case.party.added`, `case.party.removed` (Phase 8 cases
   module), `party.relationship.created` (Phase 7), `client.created` (Phase 5),
   `legal-config` events (Phase 9) as applicable. Events whose source phase is not yet built
   (Document/Task/Hearing/Deadline/Invoice/Payment) are **recorded in the schema/type union but
   not yet emitted** — they become live when their owning phase lands.
3. **Read/query API**: fetch a case's timeline projection (chronological), scoped to the active
   tenant, with pagination.
4. **Append-only immutability**: no update/delete endpoints; `CaseTimelineEvent` rows are
   insert-only at the application layer and the table is RLS `FORCE` tenant-isolated like every
   prior phase.

**Deliberately deferred (sequenced, recorded not silent):**

- Emitting events for source features not yet built (Tasks, Hearings, Deadlines, Documents,
  Invoices, Payments, Notes) — these land with their owning phases (11-21). The schema already
  models them.
- Cross-phase "projection" materialization into a denormalized read model — Phase 10 provides the
  source-of-truth append-only log and a direct query; a materialized projection view is deferred.
- UI timeline rendering — backend-first.

## Delivery workstreams

### W1 — Schema + additive migration (`20260904160000_case_timeline_foundation`)

- New enum `CaseTimelineEventType` enumerating the catalog (case_created, client_added,
  party_added, document_uploaded, task_created, hearing_scheduled, deadline_created,
  status_changed, note_added, invoice_created, payment_received, document_approved, case_closed).
- `model CaseTimelineEvent`: `id`, `tenantId`, `caseId` (tenant-checked FK to `Case`, Restrict),
  `eventType`, `occurredAt`, `actorUserId`, `actorMembershipId` (nullable refs), `payload`
  (JSON, optional, non-sensitive), timestamps.
  - `@@unique([id, tenantId])`, `@@index([tenantId, caseId, occurredAt])`.
- Additive migration: CREATE table, `FORCE RLS` + `_tenant_isolation`
  (`app_tenant_context_is_valid()` + `tenantId = current_setting('app.tenant_id', true)`), seed
  `CanViewCaseTimeline` permission.
- `prisma generate` run and the regenerated client committed so tsc passes as-pulled.

### W2 — Permissions + audit

- `PERMISSION_KEYS.CAN_VIEW_CASE_TIMELINE = 'CanViewCaseTimeline'`; add to `PERMISSION_CATALOG`
  and `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]`.
- New audit events for timeline writes/reads where a distinct event is warranted (e.g.
  `timeline.event.recorded`); ensure every new `AUDIT_EVENT_TYPES` entry is registered across all
  four audit maps **and** `METADATA_ALLOWLIST` so the completeness guard passes.

### W3 — `case-timeline/` module

- `case-timeline.module.ts`: imports `AuthModule` (+ `CasesModule` if it exposes a resolver).
- `case-timeline.operations.ts`: shared RLS `authorize`/`run`/`read` helpers (mirrors
  `case.operations.ts`).
- `case-timeline.service.ts`: `recordEvent` (append-only create), `listTimeline` (chronological,
  tenant-scoped, paginated).
- `case-timeline.controller.ts`: REST endpoints (`GET /cases/:id/timeline`,
  `POST /cases/:id/timeline` for explicit note/status events), guarded by `SessionGuard` +
  `CsrfGuard`.
- **Append-only adapters**: an accompanying writer hooks the Phase 8 cases service so
  case-created / status-changed / party-added events are emitted automatically.

### W4 — QA Gates

- `tsc --noEmit` = 0; `prisma validate` clean; `prisma migrate diff` confirms no structural drift;
  prettier clean on changed TS; full jest pass (target a bounded module spec, not the blocked
  `oidc-provider` ESM suite).

### W5 — Docs

- Author `PHASE10_CORE_DELIVERY_REVIEW.md` and record explicit deferrals.

## Closing conditions

1. A user with `CanViewCaseTimeline` / case-write permission can read an append-only, chronological
   timeline for a case within the active tenant.
2. Timeline events for existing source actions (case created, status changed, party added/removed)
   are recorded automatically and appear in the timeline.
3. No update/delete path exists — history cannot be rewritten "as if it didn't happen".
4. Full tenant isolation via RLS `FORCE`, matching every prior phase.

## Open Questions for Owner

> Recommended resolutions recorded below. Build proceeds on these unless you override.

1. **Emission trigger**: auto-record timeline events inside the existing cases/source services via
   an injected writer (recommended), vs. only exposing an explicit `POST` append endpoint. Writing
   inside source adapters best satisfies Plan.txt's "every significant change appears in timeline".
2. **Payload handling**: store a controlled optional JSON `payload` (recommended, non-sensitive),
   sanitized against allowlist, vs. no payload (event + metadata only).

## Audit Notes (2026-09-03)

- **`Plan.txt` positions confirmed**: phase list line 1264; objective/scope §482-497; carry-forward
  "timeline + audit" requirement §451.
- **No schema/permission/event collisions**: `CaseTimelineEvent`, `CanViewCaseTimeline`, and
  `timeline.*` events are all absent today (safe to add). `parties` module already defines
  `case-party.contract.ts` semantics; CaseTimelineEvent is a new read model, not a party link.
- This is a documentation/decision record only — no schema, migration, or code landed in this
  plan-authoring pass.

# Phase 6 — Conflict Check Foundation: Core Delivery Review

**Plan:** `docs/phase6/PHASE6_PLAN.md` (owner-approved, `f7443945`).
**Scope (approved):** core entity graph + decision contract; search-backed analysis and
Matter/Case acceptance wiring deferred (recorded not silent).
**Gate:** Phase 5 sealed at `b3f4e4a6` `[x] Approved`.

## Objective (restated)

A tenant-scoped `ConflictCheck` request-to-decision workflow (Requester, optional Client,
prospective Parties / Related Entities, Reviewer, Decision, Reason, Audit), a deterministic
match that surfaces existing Client/Contact collisions, and a reusable acceptance-gate decision
contract (`assertClearForCase`) for the future Matter/Case acceptance flow — guarded by the
single `CanManageConflictChecks` permission.

## What was delivered

### W1 — Schema + additive migration (`20260903100000_conflict_check_foundation`)
- New enums: `ConflictCheckStatus` (`PENDING|IN_REVIEW|COMPLETED`), `ConflictDecision`
  (`PENDING|ALLOW|BLOCK`), `ConflictPartyType` (`PARTY|RELATED_ENTITY`).
- `ConflictCheck` model: `id`, `tenantId`, `status`, `requesterUserId`, optional `clientId`,
  `decision`, `reason`, `reviewerUserId`, `reviewedAt`, `matchSummary` (denormalized JSON snapshot
  of the create-time deterministic match), timestamps; FK Tenant/Client `onDelete: Restrict`;
  `@@unique([id, tenantId])`, `@@index([tenantId, status])`.
- `ConflictParty` model: `kind`, `name`, `normalizedName`, optional `email`; FK ConflictCheck
  `onDelete: Cascade`; Tenant back-relation; `@@unique([id, tenantId])`,
  `@@index([tenantId, conflictCheckId])`.
- Additive migration with RLS `FORCE ..._tenant_isolation` on both tables + idempotent
  `CanManageConflictChecks` permission seed (mirrors Client migration). Not yet DB-applied
  (see Blocking issues).

### W2 — Permissions + audit
- `PERMISSION_KEYS.CAN_MANAGE_CONFLICT_CHECKS` added to key, `PERMISSION_CATALOG`, and
  `ROLE_PERMISSIONS[ROLE_KEY_TENANT_ADMIN]`.
- Audit events `conflict.check.created / in_review / decided` added to all four maps +
  `METADATA_ALLOWLIST` (`created: ['partyCount']`, `in_review: []`, `decided: ['decision']`).
  No party contact PII is ever audit-allowlisted.

### W3 — `conflict-checks/` module (mirrors `clients/`)
- `conflict-checks.module.ts` (imports `AuthModule`), everything registered in `app.module.ts`.
- `conflict-check.errors.ts`: non-enumerating `403 FORBIDDEN` `ConflictCheckAccessDeniedError`.
- `conflict-check.operations.ts`: `authorize` (asserts `CanManageConflictChecks`) + `run`
  (tenant ctx + atomic audit) + `read` (no audit) + `requireClientInTenant`.
- `conflict-check.service.ts`: `request`, `startReview`, `decide`, `get`, `list`.
- `conflict-check.controller.ts`: `POST /conflict-checks`, `GET /conflict-checks`,
  `GET /conflict-checks/:id`, `POST /conflict-checks/:id/review`, `POST /conflict-checks/:id/decide`
  — all `@UseGuards(SessionGuard, CsrfGuard)`.

### W4 — Deterministic match + acceptance-gate contract
- `conflict-match.service.ts`: normalizes party name/email, scans `Client.displayName` and
  `ClientContact.value` (EMAIL) within the tenant; returns per-party `{ matchedClientIds, reasons }`.
  Explicitly NOT search-backed (Phase 19 deferred).
- `conflict-gate.service.ts`: `assertClearForCase(transaction, tenantId, prospectiveParties)` →
  `{ cleared, blocks, reasons }`. A COMPLETED check with decision `BLOCK` whose normalized party
  matches a prospective party yields `cleared: false`. Conservative posture; the call site for
  Matter/Case acceptance is delivered in Phase 7/8.

## Gates (evidence)

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| `prisma validate` | ✅ valid |
| prettier (`conflict-checks/`, `permission.constants.ts`, `audit`, `app.module.ts`) | ✅ clean |
| full jest | ✅ **239/239** (46 suites; only the pre-existing `openid-client` ESM suite excluded — 0 tests) |

## Deviation from plan (recorded, not silent)

The approved plan listed the `conflict.check.created` metadata allowlist as `['kind']` and W1
listed a `prospectiveParties` denormalized snapshot. Delivery records instead:
- `created: ['partyCount']` (a count is the safe, non-PII, meaningful create-time shape; `kind`
  is per-party and not a single check-level field).
- The parties ARE the `ConflictParty` rows; `matchSummary` (the deterministic match evidence —
  matched Client ids + reasons) is stored as the denormalized audit/evidence snapshot rather than
  a redundant parties copy.
These are minor, additive refinements consistent with the plan's intent and are flagged for
owner review.

## Explicit deferrals (unaffected by this delivery)

- Matter/Case acceptance wiring (`assertClearForCase` call site) — Phase 7/8.
- Search-backed conflict analysis — Phase 19.
- Party/Role linkage (`Party`/`CaseParty`/`PartyRole`) — Phase 7.
- Historical matters evaluation — no `Matter` entity until Phase 8.
- Reviewer workflow UI / intake integration — Phase 7/8/29.
- Retention/legal-hold of conflict records — Phase 30.

## Blocking issues

- **Migration not DB-applied.** `20260903100000_conflict_check_foundation` is committed but not
  applied to Neon from this sandbox (DB unreachable). Owner applies + drift-checks on a
  DB-reachable machine (`Set-Location C:\Users\ahmed\Documents\GitHub\Mohamy-pro\backend\api`;
  `pnpm prisma migrate deploy`; `pnpm prisma migrate diff`). Sole remediation for gate closure.

## Owner approval

- [ ] **Approved** — Phase 6 (Conflict Check Foundation) core delivery gate accepted; remaining
  Phase 6 follow-ups and Phase 7 (Party Management) are not treated as authorized until this box
  is ticked.

## References

- `docs/phase6/PHASE6_PLAN.md` (approved plan `f7443945`)
- `docs/phase5/PHASE5_COMPLETION_REVIEW.md` (sealed Phase 5 gate `b3f4e4a6`)
- `Plan.txt` §354-380 (Phase 6), line 44
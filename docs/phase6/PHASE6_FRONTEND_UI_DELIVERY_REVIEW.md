# Phase 6 — Conflict Check Foundation Frontend UI (Delivery Review)

> **Status:** DELIVERED — Phase 6 frontend UI, the "Reviewer workflow UI" called out in
> `PHASE6_PLAN.md` §55 and §167 ("backend-first (mirrors Phase 4/5); UI and intake hooks land in
> Phase 7/8/29"). This delivery adds the frontend for the Phase 6 Conflict Check Foundation
> (request a check, screen prospective parties, start review, record an ALLOW/BLOCK decision).
> It mirrors the Phase 4 (org-config) and Phase 5 (clients) frontend follow-ups.
> **Performed against:** local `main` working tree in `apps/web`.
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `vitest run` 24/24 (2 files) · `tsc --noEmit` exit 0 · `next build --webpack`
> EXIT=0 (route `ƒ /[locale]/conflict-checks` compiled).

---

## Scope delivered

The Phase 6 backend core delivery (`89f0337f`, sealed per AGENTS.md) deferred the reviewer
workflow UI to a follow-up. This delivery closes that follow-up against the existing
`conflict-checks/` backend contract:

1. **`ConflictChecksClient`** — typed API client in `apps/web/src/lib/api.ts` covering every
   endpoint of the backend `conflict-check.controller.ts`: `request` (`POST /conflict-checks`),
   `list` (`GET /conflict-checks`), `get` (`GET /conflict-checks/:id`),
   `startReview` (`POST /conflict-checks/:id/review`), `decide` (`POST /conflict-checks/:id/decide`).
2. **Schema-aligned types** — enums (`ConflictCheckStatus`, `ConflictDecision`,
   `ConflictPartyKind`) and result/request interfaces mirroring the backend
   `conflict-check.service.ts` shapes exactly.
3. **Route + page** — `GET /[locale]/conflict-checks` renders the conflict-check reviewer UI.
4. **Navigation** — a `conflictChecks` item added to the app shell after `clients`.
5. **Localization** — a full `conflictChecks` namespace (en + ar, structurally identical) plus the
   `navigation.conflictChecks` key in both catalogs.
6. **Unit tests** — a `ConflictChecksClient (Phase 6)` describe block validating request
   construction/URLs against all five backend routes.

## What was built

### API client (`apps/web/src/lib/api.ts`)
- Enums: `ConflictCheckStatus = PENDING|IN_REVIEW|COMPLETED`, `ConflictDecision = PENDING|ALLOW|BLOCK`,
  `ConflictPartyKind = PARTY|RELATED_ENTITY`.
- Result types: `ConflictCheckResult`, `ConflictPartyResult`, `ConflictMatchResult`,
  `ConflictCheckListRow`, `ConflictCheckListResult`.
- Request types: `CreateConflictCheckRequest` (clientId + parties[{kind,name,email}]),
  `StartConflictReviewRequest`, `DecideConflictCheckRequest` (id + ALLOW/BLOCK + reason),
  `ListConflictChecksQuery` (page/limit/status).
- Route mapping verified against `conflict-check.controller.ts` / DTOs.

### UI components (`apps/web/src/components/pages/conflict-checks/`)
Follow the established `useAuth` + react-hook-form + zod + `FormField` + `OperationResult` +
`Button` conventions already used by the org-config and clients pages. No client-side permission
gating — mutating controls are disabled until authenticated; the backend enforces
`CanManageConflictChecks` via RLS (Phase 5/6 convention, "frontend permissions are for UI only").

| Component | Responsibility |
|---|---|
| `conflict-checks-page.tsx` | Orchestrator; page heading + section stack. |
| `conflict-check-list-section.tsx` | `list`: status filter + pagination; renders check id, status, decision, party count. |
| `conflict-check-section.tsx` | `request` (with dynamic party rows via `useFieldArray`), `startReview`, and authoritative `ALLOW`/`BLOCK` decision buttons with a reason. |

### Route + nav + i18n
- `apps/web/src/app/[locale]/conflict-checks/page.tsx` — locale-prefixed route rendering the page.
- `apps/web/src/components/app-shell.tsx` — `{ href: '/conflict-checks', label: t('navigation.conflictChecks') }`
  inserted after `clients`.
- `apps/web/messages/en.json` / `ar.json` — `conflictChecks` namespace (top-level, `labels`, and
  `placeholders` structurally identical across locales; verified) + `navigation.conflictChecks`
  (`Conflict checks` / `فحص تضارب المصالح`).
- `apps/web/src/i18n/messages.test.ts` — navigation `toEqual` assertion extended to include
  `conflictChecks`.

### Tests
`ConflictChecksClient (Phase 6)` — 5 cases in `apps/web/src/lib/api.test.ts`:
1. requests a conflict check via `POST /conflict-checks`,
2. lists conflict checks with query params on `GET /conflict-checks`,
3. gets a single check via `GET /conflict-checks/:id`,
4. starts review via `POST /conflict-checks/:id/review`,
5. records a decision via `POST /conflict-checks/:id/decide`.

Uses the same CSRF-stubbed handler-map `clientWith` helper as the Phase 5 block.

## Security & isolation notes
- No business logic in the frontend (`phase0/ARCHITECTURE.md`); the client is a thin typed wrapper.
- Tenant scoping is backend-only (tenant derived from session + RLS `FORCE`); the frontend never
  sends a `tenantId`.
- The conflict decision (ALLOW/BLOCK) and reason are recorded by the backend under
  `CanManageConflictChecks` with transactional audit; the UI never exposes matched-party PII —
  `matchSummary` surfaced by the API is not rendered by this initial UI.

## Gates (evidence)

| Gate | Result |
|---|---|
| `vitest run` | ✅ **24/24** (2 files: `api.test.ts`, `messages.test.ts`) |
| `tsc --noEmit` | ✅ exit 0 |
| `next build --webpack` | ✅ EXIT=0; route `ƒ /[locale]/conflict-checks` compiled |

## Caveats for the gate
1. **Backend remains authoritative.** This is the UI follow-up only; it does not change the Phase 6
   backend scope and does not re-open the migration-apply blocker already recorded in
   `PHASE6_CORE_DELIVERY_REVIEW.md` (the `20260903100000_conflict_check_foundation` migration is
   still owner-applied on a DB-reachable machine).
2. **Reviewer workflow is a terminal step, not a full intake integration.** The UI can request,
   review, and decide a check; it does not (yet) wire into Matter/Case acceptance (Phase 7/8) or
   the public intake flow (Phase 29) — those remain backend/scoped follow-ups, not defects.
3. **Match evidence is not rendered in this first UI pass** — the deterministic-match `matchSummary`
   is returned by the API but not yet surfaced as a visual review aid; flagged as a follow-up.

## References
- `PHASE6_PLAN.md` §55, §167 (reviewer workflow UI deferral)
- `PHASE6_CORE_DELIVERY_REVIEW.md` (sealed backend core delivery `89f0337f`)
- `docs/phase5/PHASE5_FRONTEND_UI_DELIVERY_REVIEW.md` (frontend follow-up precedent)
- `phase0/AUTHORIZATION.md` (frontend permissions are for UI only)
- `apps/web/src/lib/api.ts`, `apps/web/src/components/pages/conflict-checks/`,
  `apps/web/src/app/[locale]/conflict-checks/`

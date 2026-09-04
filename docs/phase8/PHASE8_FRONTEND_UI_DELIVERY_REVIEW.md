# Phase 8 — Matter / Case Management Frontend UI (Delivery Review)

> **Status:** DELIVERED — Phase 8 frontend UI, the "Frontend UI (backend-first)" deferral recorded
> (not silent) in `PHASE8_PLAN.md` and `PHASE8_CORE_DELIVERY_REVIEW.md`. This delivery adds the
> frontend for the Phase 8 Matter / Case Management Foundation (create/list/update cases, and link
> parties + roles to a case). It mirrors the Phase 4/5/6/7 frontend follow-ups.
> **Performed against:** local `main` working tree in `apps/web`.
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `vitest run` 38/38 (2 files) · `tsc --noEmit` exit 0 · `next build --webpack`
> EXIT=0 (route `ƒ /[locale]/cases` compiled).

---

## Scope delivered

The Phase 8 backend core delivery deferred the case UI to a follow-up. This delivery closes that
follow-up against the existing `cases/` backend contract:

1. **`CasesClient`** — typed API client in `apps/web/src/lib/api.ts` covering every route of the
   backend `case.controller.ts`: `create` (`POST /cases`), `list` (`GET /cases`), `get`
   (`GET /cases/:id`), `update` (`PATCH /cases/:id`), `addParty` (`POST /cases/:id/parties`),
   `removeParty` (`DELETE /cases/:id/parties/:partyId`).
2. **Schema-aligned types** — `CaseStatus`, `CasePriority`, `PartyType` and detail/list/result
   interfaces mirroring the backend `case.service.ts` shapes exactly (including the nested
   `client` and `parties` joins on `CaseDetail`).
3. **Route + page** — `GET /[locale]/cases` renders the case-management UI.
4. **Navigation** — a new `matters` sidebar group (icon `Briefcase`) with a `cases` item.
5. **Localization** — a full `cases` namespace (en + ar, structurally identical), a new
   `navigation.groups.matters` group title, and the `navigation.cases` key in both catalogs.
6. **Unit tests** — a `CasesClient (Phase 8)` describe block validating request construction/URLs
   against all six backend routes.

## What was built

### API client (`apps/web/src/lib/api.ts`)
- Unions: `CaseStatus = OPEN|ON_HOLD|CLOSED`, `CasePriority = LOW|NORMAL|HIGH|URGENT`.
- Result types: `CaseListRow` (with `client` + flat `parties` refs), `CaseResult` (bare model),
  `CaseDetail` (with nested `client` + full `parties` incl. `party`/`role`), `CaseListResult`,
  `CasePartyResult` (bare `CaseParty` model), `CaseGateBlock` (the conflict-gate rejection shape).
- Request types: `CreateCaseRequest` (caseNumber/clientId required + optional fields + `partyIds`),
  `UpdateCaseRequest`, `AddCasePartyRequest` (partyId + roleId), `RemoveCasePartyRequest`,
  `ListCasesQuery` (page/limit/search/status).
- Route mapping verified against `case.controller.ts` / `case.dto.ts`.

### UI components (`apps/web/src/components/pages/cases/`)
Follow the established `useAuth` + react-hook-form + zod + `FormField` + `OperationResult` +
`Button` conventions already used by the parties and conflict-checks pages. No client-side
permission gating — mutating controls are disabled until authenticated; the backend enforces
`CanManageCases` via RLS (established convention, "frontend permissions are for UI only").

Each component is a focused file with a single responsibility:

| Component | Responsibility |
|---|---|
| `cases-page.tsx` | Orchestrator; page heading + section stack. |
| `case-list-section.tsx` | `list`: search + status filter + pagination; renders case number, client, status, priority, id. |
| `case-section.tsx` | `create` / `update` a case (number, client, practice area, type, status, priority, dates, optional party ids). |
| `case-party-section.tsx` | `addParty` (case + party + role) and `removeParty` (case + party) links. |
| `case-detail-section.tsx` | `get`: fetches a single case with nested parties and renders party display name, role label, type. |

### Route + nav + i18n
- `apps/web/src/app/[locale]/cases/page.tsx` — locale-prefixed route rendering the page.
- `apps/web/src/components/navigation/nav-groups.ts` — new `matters` group (title key
  `navigation.groups.matters`, icon `Briefcase`) containing the `cases` item (`navigation.cases`).
- `apps/web/messages/en.json` / `ar.json` — `cases` namespace (top-level, `labels`, `placeholders`
  structurally identical across locales; verified) + `navigation.cases` (`Cases` / `القضايا`) and
  `navigation.groups.matters` (`Matters` / `القضايا`).
- `apps/web/src/i18n/messages.test.ts` — navigation `toEqual` assertions extended with `cases` and
  the `matters` group in both locales.

### Tests
`CasesClient (Phase 8)` — 6 cases in `apps/web/src/lib/api.test.ts`:
1. creates a case via `POST /cases` with `partyIds`,
2. lists cases with query params on `GET /cases`,
3. gets a single case detail via `GET /cases/:id` with nested parties/roles,
4. updates a case via `PATCH /cases/:id`,
5. adds a party via `POST /cases/:id/parties`,
6. removes a party via `DELETE /cases/:id/parties/:partyId`.

Uses the same CSRF-stubbed handler-map `clientWith` helper as the Phase 5/6/7 blocks.

## Security & isolation notes
- No business logic in the frontend (`phase0/ARCHITECTURE.md`); the client is a thin typed wrapper.
- Tenant scoping is backend-only (tenant derived from session + RLS `FORCE`); the frontend never
  sends a `tenantId`.
- The conflict-acceptance gate runs entirely on the backend (`CaseGateRejectionError` with `blocks`);
  the frontend surfaces the `ApiError` (message/code/details) but performs no independent gating.
- The optional `partyIds` on create and the `addParty`/`removeParty` links are validated by the
  backend for tenant membership; the UI only sends opaque IDs and never bypasses that check.

## Gates (evidence)

| Gate | Result |
|---|---|
| `vitest run` | ✅ **38/38** (2 files: `api.test.ts`, `messages.test.ts`) |
| `tsc --noEmit` | ✅ exit 0 |
| `next build --webpack` | ✅ EXIT=0; route `ƒ /[locale]/cases` compiled |

## Caveats for the gate
1. **Backend remains authoritative.** This is the UI follow-up only; it does not change the Phase 8
   backend scope and does not re-open the migration-apply blocker already recorded in
   `PHASE8_CORE_DELIVERY_REVIEW.md` (the migrations are still owner-applied on a DB-reachable
   machine).
2. **List rows carry only flat party refs.** The `GET /cases` list endpoint returns `parties` as
   `{id, partyId, roleId, status}` without party/role display names; the list UI therefore renders
   case fields + client name, while full party/role details are available via the single-case
   detail (`case-detail-section.tsx`) — a deliberate reflection of the backend contract, not a defect.
3. **Role semantics resolve on the backend.** The `cases` UI links parties by `partyId` + `roleId`
   (opaque IDs); it does not render a role catalog picker in this first pass (a recorded follow-up).

## References
- `PHASE8_PLAN.md` §28 (frontend UI deferral) and W3/W4 (cases module + acceptance gate)
- `docs/phase8/PHASE8_CORE_DELIVERY_REVIEW.md` (sealed backend core delivery)
- `docs/phase7/PHASE7_FRONTEND_UI_DELIVERY_REVIEW.md` (frontend follow-up precedent)
- `phase0/AUTHORIZATION.md` (frontend permissions are for UI only)
- `apps/web/src/lib/api.ts`, `apps/web/src/components/pages/cases/`,
  `apps/web/src/app/[locale]/cases/`

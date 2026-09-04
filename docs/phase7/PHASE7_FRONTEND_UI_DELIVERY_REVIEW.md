# Phase 7 — Party Management Frontend UI (Delivery Review)

> **Status:** DELIVERED — Phase 7 frontend UI, the "Frontend party UI" deferral recorded (not
> silent) in `PHASE7_PLAN.md` ("backend-first, mirrors Phases 4/5/6") and
> `PHASE7_CORE_DELIVERY_REVIEW.md`. This delivery adds the frontend for the Phase 7 Party Management
> Foundation (create/list/update/archive parties, and record party-to-party relationships).
> It mirrors the Phase 4 (org-config), Phase 5 (clients), and Phase 6 (conflict-checks) frontend
> follow-ups.
> **Performed against:** local `main` working tree in `apps/web`.
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `vitest run` 32/32 (2 files) · `tsc --noEmit` exit 0 · `next build --webpack`
> EXIT=0 (route `ƒ /[locale]/parties` compiled).

---

## Scope delivered

The Phase 7 backend core delivery (`PHASE7_CORE_DELIVERY_REVIEW.md`) deferred the party UI to a
follow-up. This delivery closes that follow-up against the existing `parties/` backend contract:

1. **`PartyClient`** — typed API client in `apps/web/src/lib/api.ts` covering every route of the
   backend `party.controller.ts`: `create` (`POST /parties`), `list` (`GET /parties`),
   `get` (`GET /parties/:id`), `update` (`PATCH /parties/:id`), `archive` (`DELETE /parties/:id`),
   `listRoles` (`GET /parties/roles`), `createRelationship`
   (`POST /parties/:id/relationships`), `listRelationships` (`GET /parties/:id/relationships`).
2. **Schema-aligned types** — `PartyType` (`PERSON|ORGANIZATION`), `HierarchyStatus`
   (`ACTIVE|ARCHIVED`) and result/request interfaces mirroring the backend
   `party.service.ts` / `party-role.service.ts` / `party-relationship.service.ts` shapes exactly.
3. **Route + page** — `GET /[locale]/parties` renders the party-management UI.
4. **Navigation** — a `parties` item added to the `clients-parties` sidebar group.
5. **Localization** — a full `parties` namespace (en + ar, structurally identical) plus the
   `navigation.parties` key in both catalogs.
6. **Unit tests** — a `PartyClient (Phase 7)` describe block validating request construction/URLs
   against all eight backend routes.

## What was built

### API client (`apps/web/src/lib/api.ts`)
- Enums / unions: `PartyType = PERSON|ORGANIZATION`, reuses `HierarchyStatus = ACTIVE|ARCHIVED`.
- Result types: `PartyResult`, `PartyRoleResult`, `PartyRelationshipResult`
  (with optional nested `fromParty`/`toParty` refs), `PartyListResult`,
  `PartyRelationshipListResult`.
- Request types: `CreatePartyRequest` (partyType + conditional name/legalName + displayName +
  optional clientId/notes), `UpdatePartyRequest`, `ArchivePartyRequest`, `ListPartiesQuery`
  (page/limit/search/status/partyType), `CreatePartyRelationshipRequest`
  (fromPartyId + toPartyId + relationshipType).
- Route mapping verified against `party.controller.ts` / DTOs. `GET /parties/roles` is matched as a
  literal before `GET /parties/:id` in the client, consistent with the controller ordering.

### UI components (`apps/web/src/components/pages/parties/`)
Follow the established `useAuth` + react-hook-form + zod + `FormField` + `OperationResult` +
`Button` conventions already used by the clients and conflict-checks pages. No client-side
permission gating — mutating controls are disabled until authenticated; the backend enforces
`CanManageParties` via RLS (Phase 5/6 convention, "frontend permissions are for UI only").

Each component is a focused file with a single responsibility:

| Component | Responsibility |
|---|---|
| `parties-page.tsx` | Orchestrator; page heading + section stack. |
| `party-list-section.tsx` | `list`: search/status/partyType filters + pagination; renders party display name, type, status, id. |
| `party-section.tsx` | `create` / `update` / `archive` a party (person or organization, optional client link + notes). |
| `party-relationship-section.tsx` | `createRelationship` (from → to + type) and `listRelationships` with the counterparty display name. |

### Route + nav + i18n
- `apps/web/src/app/[locale]/parties/page.tsx` — locale-prefixed route rendering the page.
- `apps/web/src/components/navigation/nav-groups.ts` — `{ href: '/parties', labelKey: 'navigation.parties' }`
  inserted into the `clients-parties` group (after `clients`, before `conflict-checks`).
- `apps/web/messages/en.json` / `ar.json` — `parties` namespace (top-level, `labels`, and
  `placeholders` structurally identical across locales; verified) + `navigation.parties`
  (`Parties` / `الأطراف`).
- `apps/web/src/i18n/messages.test.ts` — navigation `toEqual` assertion extended to include
  `parties` in both locales.

### Tests
`PartyClient (Phase 7)` — 8 cases in `apps/web/src/lib/api.test.ts`:
1. creates a party via `POST /parties`,
2. lists parties with query params on `GET /parties`,
3. gets a single party via `GET /parties/:id`,
4. updates a party via `PATCH /parties/:id`,
5. archives a party via `DELETE /parties/:id` with a reason,
6. lists the role catalog via `GET /parties/roles`,
7. creates a relationship via `POST /parties/:id/relationships`,
8. lists relationships via `GET /parties/:id/relationships` (with query params).

Uses the same CSRF-stubbed handler-map `clientWith` helper as the Phase 5/6 blocks.

## Security & isolation notes
- No business logic in the frontend (`phase0/ARCHITECTURE.md`); the client is a thin typed wrapper.
- Tenant scoping is backend-only (tenant derived from session + RLS `FORCE`); the frontend never
  sends a `tenantId`.
- The optional `clientId` link on a Party is validated by the backend to exist within the same
  tenant; the frontend only accepts a client id string and never bypasses that check.
- Self-relationships (`fromPartyId === toPartyId`) are rejected by the backend
  (`party-relationship.service.ts`); the UI holds no special handling since the backend is
  authoritative.

## Gates (evidence)

| Gate | Result |
|---|---|
| `vitest run` | ✅ **32/32** (2 files: `api.test.ts`, `messages.test.ts`) |
| `tsc --noEmit` | ✅ exit 0 |
| `next build --webpack` | ✅ EXIT=0; route `ƒ /[locale]/parties` compiled |

## Caveats for the gate
1. **Backend remains authoritative.** This is the UI follow-up only; it does not change the Phase 7
   backend scope and does not re-open the migration-apply blocker already recorded in
   `PHASE7_CORE_DELIVERY_REVIEW.md` (the `20260904100000_party_management_foundation` migration is
   still owner-applied on a DB-reachable machine).
2. **Party roles are a read-only catalog in this first UI pass.** The backend exposes
   `GET /parties/roles` (seeded defaults + free-form custom roles) and the `CaseParty` linking
   contract; the frontend ships the role-list client method but does not render a role-assignment
   UI (that is Phase 8 case wiring) — a recorded, not-silent follow-up, not a defect.
3. **Relationships are a one-to-many counterparty link in this first pass.** The UI can create and
   list party-to-party relationships; no relationship graph/network visualization is included yet.

## References
- `PHASE7_PLAN.md` §46 (frontend UI deferral) and W3/W4 (parties module + CaseParty contract)
- `PHASE7_CORE_DELIVERY_REVIEW.md` (sealed backend core delivery)
- `docs/phase6/PHASE6_FRONTEND_UI_DELIVERY_REVIEW.md` (frontend follow-up precedent)
- `phase0/AUTHORIZATION.md` (frontend permissions are for UI only)
- `apps/web/src/lib/api.ts`, `apps/web/src/components/pages/parties/`,
  `apps/web/src/app/[locale]/parties/`

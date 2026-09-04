# Phase 9 — Legal Configuration Frontend UI (Delivery Review)

> **Status:** DELIVERED — Phase 9 frontend UI, the "Frontend UI" deferral recorded (not silent) in
> `PHASE9_PLAN.md` and `PHASE9_CORE_DELIVERY_REVIEW.md`. This delivery adds the frontend for the
> Phase 9 Legal Configuration (Country / Jurisdiction / Court / Court Location) hybrid-tenancy
> dictionary. It mirrors the Phase 4/5/6/7/8 frontend follow-ups.
> **Performed against:** local `main` working tree in `apps/web`.
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `vitest run` 44/44 (2 files) · `tsc --noEmit` exit 0 · `next build --webpack`
> EXIT=0 (route `ƒ /[locale]/legal-config` compiled).

---

## Scope delivered

The Phase 9 backend core delivery deferred the configuration UI to a follow-up. This delivery
closes that follow-up against the existing `legal-config/` backend contract:

1. **`LegalConfigClient`** — typed API client in `apps/web/src/lib/api.ts` covering every route of
   the backend `legal-config.controller.ts`:
   - `listCountries` (`GET /legal-config/countries`),
   - `createCountry` (`POST /legal-config/countries`),
   - `listJurisdictions` (`GET /legal-config/jurisdictions?countryId=`),
   - `createJurisdiction` (`POST /legal-config/jurisdictions`),
   - `listCourts` (`GET /legal-config/courts?jurisdictionId=`),
   - `createCourt` (`POST /legal-config/courts`),
   - `listCourtLocations` (`GET /legal-config/court-locations?courtId=`),
   - `createCourtLocation` (`POST /legal-config/court-locations`).
2. **Schema-aligned types** — `CountryResult`, `JurisdictionResult`, `CourtResult`,
   `CourtLocationResult` mirroring the backend `legal-config.service.ts` shapes exactly (including
   the nullable `tenantId`/`status` fields and the optional court `courtType`/`department` and
   location `city`/`address` fields). Create-request types mirror the DTOs.
3. **Route + page** — `GET /[locale]/legal-config` renders the legal-configuration UI.
4. **Navigation** — a `legalConfig` item (icon `Scale`) added to the existing `configuration`
   sidebar group.
5. **Localization** — a full `legalConfig` namespace (en + ar, structurally identical) and the
   `navigation.legalConfig` key in both catalogs.
6. **Unit tests** — a `LegalConfigClient (Phase 9)` describe block validating request
   construction/URLs against all eight backend routes.

## What was built

### API client (`apps/web/src/lib/api.ts`)
- Result types: `CountryResult` (id/code/name/status/timestamps), `JurisdictionResult`
  (nullable `tenantId` + `countryId`), `CourtResult` (nullable `tenantId` + `jurisdictionId` +
  optional `courtType`/`department`), `CourtLocationResult` (nullable `tenantId` + `courtId` +
  optional `city`/`address`). Each includes `status: HierarchyStatus` and timestamps.
- Request types: `CreateCountryRequest` (code + name), `CreateJurisdictionRequest`
  (countryId + name), `CreateCourtRequest` (jurisdictionId + name + optional courtType/department),
  `CreateCourtLocationRequest` (courtId + name + optional city/address).
- The client mirrors the backend's list semantics: `listCountries()` and `listJurisdictions()` /
  `listCourts()` accept an **optional** parent filter, while `listCourtLocations(courtId)` requires
  a `courtId` query param (matching the controller's mandatory `courtId`). List endpoints return
  plain arrays — the client surfaces them as `T[]`, not a paginated envelope.
- Route mapping verified against `legal-config.controller.ts` / `legal-config.dto.ts`.

### UI components (`apps/web/src/components/pages/legal-config/`)
Follow the established `useAuth` + react-hook-form + zod + `FormField` + `OperationResult` +
`Button` conventions already used by the parties/conflict-checks/cases pages. No client-side
permission gating — mutating controls are disabled until authenticated; the backend enforces
`CanManageLegalConfig` / `CanManageGlobalLegalConfig` (tenant/global scope) and RLS
(established convention, "frontend permissions are for UI only").

Each component is a focused file with a single responsibility:

| Component | Responsibility |
|---|---|
| `legal-config-page.tsx` | Orchestrator; page heading + section stack. |
| `country-section.tsx` | Global dictionary: create a managed country + list all countries. |
| `jurisdiction-section.tsx` | Create a jurisdiction (under `countryId`) + list jurisdictions. |
| `court-section.tsx` | Create a court (under `jurisdictionId`) + list courts. |
| `court-location-section.tsx` | Create a court location (under `courtId`) + list locations for a required `courtId`. |

### Route + nav + i18n
- `apps/web/src/app/[locale]/legal-config/page.tsx` — locale-prefixed route rendering the page.
- `apps/web/src/components/navigation/nav-groups.ts` — `legalConfig` item (icon `Scale`) added to
  the `configuration` group (`navigation.legalConfig`).
- `apps/web/messages/en.json` / `ar.json` — `legalConfig` namespace (top-level, `labels`,
  `placeholders`, `result`, `sections` structurally identical across locales; verified) +
  `navigation.legalConfig` (`Legal configuration` / `الإعداد القانوني`).
- `apps/web/src/i18n/messages.test.ts` — navigation `toEqual` assertion extended with `legalConfig`
  in both locales.

### Tests
`LegalConfigClient (Phase 9)` — 6 cases in `apps/web/src/lib/api.test.ts`:
1. creates a country via `POST /legal-config/countries`,
2. lists countries via `GET /legal-config/countries`,
3. creates and lists jurisdictions scoped by `countryId`,
4. creates and lists courts scoped by `jurisdictionId`,
5. lists court locations (requiring a `courtId`),
6. creates a court location via `POST /legal-config/court-locations`.

Uses the same CSRF-stubbed handler-map `clientWith` helper as the Phase 5/6/7/8 blocks (handlers
keyed by path suffix and disambiguating create vs. list by HTTP method).

## Security & isolation notes
- No business logic in the frontend (`phase0/ARCHITECTURE.md`); the client is a thin typed wrapper.
- Hybrid tenancy (`tenantId` nullable on `Jurisdiction`/`Court`/`CourtLocation`) is backend-only;
  the frontend never sends a `tenantId` and cannot read or write outside its tenant/global scope.
- Global `Country` writes require `CanManageGlobalLegalConfig` (Platform Admin), while
  jurisdiction/court/court-location writes require `CanManageLegalConfig` (Tenant Admin). These
  checks are enforced on the backend; the UI only disables buttons until authentication.
- Parent-attach integrity (`requireParentVisible`) is enforced on the backend; the UI simply sends
  the child's parent ID and surfaces any `ApiError` from a rejected attach.

## Gates (evidence)

| Gate | Result |
|---|---|
| `vitest run` | ✅ **44/44** (2 files: `api.test.ts`, `messages.test.ts`) |
| `tsc --noEmit` | ✅ exit 0 |
| `next build --webpack` | ✅ EXIT=0; route `ƒ /[locale]/legal-config` compiled |

## Caveats for the gate
1. **Backend remains authoritative.** This is the UI follow-up only; it does not change the Phase 9
   backend scope (already sealed in `PHASE9_CORE_DELIVERY_REVIEW.md`), and the deferred
   update/archive/delete lifecycle endpoints are not exercised by this UI (create + list only,
   mirroring the backend contract).
2. **Lists are flat, unpaginated arrays.** The backend `list*` endpoints return plain
   `findMany` arrays (no envelope/pagination), so the UI renders raw arrays with a count rather
   than the paginated list used by the cases page — a deliberate reflection of the contract.
3. **Court-location list requires a `courtId`.** Because `listCourtLocations` mandates `courtId`,
   the court-location section exposes a separate court-ID input for listing distinct from the
   create form, so a user can list locations for any (tenant-visible) court.
4. **No role/status filters.** The backend does not expose status-based filtering or pagination on
   these read endpoints (a recorded Phase 9 deferral), so the UI does not offer them yet.

## References
- `PHASE9_PLAN.md` (frontend UI deferral) and the hybrid-tenancy design
- `docs/phase9/PHASE9_CORE_DELIVERY_REVIEW.md` (sealed backend core delivery)
- `docs/phase8/PHASE8_FRONTEND_UI_DELIVERY_REVIEW.md` (frontend follow-up precedent)
- `phase0/AUTHORIZATION.md` (frontend permissions are for UI only)
- `apps/web/src/lib/api.ts`, `apps/web/src/components/pages/legal-config/`,
  `apps/web/src/app/[locale]/legal-config/`

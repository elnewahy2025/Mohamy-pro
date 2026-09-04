# Phase 5 — Client Management Frontend UI (Delivery Review)

> **Status:** DELIVERED — Phase 5 frontend UI, the "sequenced follow-up" called out in
> `PHASE5_COMPLETION_REVIEW.md` §62-63 ("Frontend client UI — backend-first; the list page and
> client forms are sequenced follow-ups"). This delivery adds the frontend for the Phase 5
> **core Client profile** (client CRUD, list/search/filter, contacts, addresses).
> **Performed against:** local `main` working tree in `apps/web`.
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `vitest run` 19/19 (2 files) · `tsc --noEmit` exit 0 · `next build --webpack`
> EXIT=0 (route `ƒ /[locale]/clients` compiled).

---

## Scope delivered

The Phase 5 core backend (`54882601`) deferred the frontend client UI to a follow-up. This
delivery closes that follow-up for the **core Client profile** shipped in the core delivery:

1. **`ClientsClient`** — typed API client in `apps/web/src/lib/api.ts` covering every endpoint of
   the Phase 5 core profile: `createClient` / `listClients` / `getClient` / `updateClient` /
   `archiveClient` and the contact/address sub-resources (`createContact` / `updateContact` /
   `removeContact` / `createAddress` / `updateAddress` / `removeAddress`).
2. **Schema-aligned types** — enums (`ClientType`, `ClientStatus`, `ContactType`, `AddressType`)
   and result/request interfaces mirroring the backend contracts exactly.
3. **Route + page** — `GET /[locale]/clients` renders the client-management page.
4. **Navigation** — a `clients` item added to the app shell after `organization`.
5. **Localization** — full `clients` namespace (en + ar, structurally identical) plus the
   `navigation.clients` key in both catalogs.
6. **Unit tests** — a `ClientsClient (Phase 5)` describe block validating the client's request
   construction against the backend routes.

## What was built

### API client (`apps/web/src/lib/api.ts`)
- Enums: `ClientType = 'INDIVIDUAL' | 'ORGANIZATION'`, `ClientStatus = 'ACTIVE' | 'ARCHIVED'`,
  `ContactType`, `AddressType`.
- Result types: `ClientResult`, `ClientContactResult`, `ClientAddressResult`, `ClientListResult`
  (data + `PaginationMeta`).
- Request types: `CreateClientRequest`, `UpdateClientRequest`, `ArchiveClientRequest` (reason),
  `ListClientsQuery` (`page`/`limit`/`search`/`status`/`clientType`), plus
  `Create/Update/Remove` contact and address requests.
- Route mapping verified against the backend (`client.controller.ts`, `contact.controller.ts`,
  `address.controller.ts`):
  - Clients: `POST /clients`, `GET /clients` (+ query string), `GET/PATCH/DELETE /clients/:id`.
  - Contacts: `POST /clients/:clientId/contacts`, `PATCH/DELETE /clients/:clientId/contacts/:id`.
  - Addresses: `POST /clients/:clientId/addresses`, `PATCH/DELETE /clients/:clientId/addresses/:id`.
- Update/remove carry the `clientId` path segment (Nest requires it for the sub-resource routes).

### UI components (`apps/web/src/components/pages/clients/`)
Follow the established `useAuth` + react-hook-form + zod + `FormField` + `OperationResult` +
`Button` conventions already used by the Phase 4 organization-config UI. No client-side permission
gating — actions are disabled via `authLoading || !user`; the backend enforces `CanManageClients`
through RLS (Phase 5 convention, per `phase0/AUTHORIZATION.md` "Frontend permissions are for UI
only").

| Component | Responsibility |
|---|---|
| `clients-page.tsx` (27) | Orchestrator; page heading + section stack. |
| `client-list-section.tsx` (170) | `listClients`: search / status / clientType filters + pagination; filter state preserved across renders. |
| `client-section.tsx` (224) | create / update / archive (with reason on archive). |
| `contact-section.tsx` (209) | contact create / update / remove (type, value, label, isPrimary). |
| `address-section.tsx` (285) | address create / update / remove (type, lines, city/region/postal/country, isPrimary). |

### Route + nav + i18n
- `apps/web/src/app/[locale]/clients/page.tsx` — locale-prefixed route rendering `ClientsPage`.
- `apps/web/src/components/app-shell.tsx:21` — `{ href: '/clients', label: t('navigation.clients') }`
  inserted after `organization`.
- `apps/web/messages/en.json` / `ar.json` — `clients` namespace (top-level and `labels` structurally
  identical across locales; verified) + `navigation.clients` (`Clients` / `العملاء`).
- `apps/web/src/i18n/messages.test.ts` — navigation `toEqual` assertion extended to include `clients`.

### Tests
`ClientsClient (Phase 5)` — 6 cases in `apps/web/src/lib/api.test.ts`:
1. creates a client via `POST /clients`,
2. lists clients with query params on `GET /clients`,
3. updates a client via `PATCH /clients/:id`,
4. archives a client via `DELETE /clients/:id` with a reason,
5. creates a contact under `clients/:clientId/contacts`,
6. removes an address via `DELETE clients/:clientId/addresses/:id`.

Uses the shared `clientWith` helper (CSRF-stubbed, handler-map matching); the list test matches on
the `clientType=INDIVIDUAL` query-suffix rather than `/clients?page` to avoid a 404 on the stub.

## Security & isolation notes
- No business logic in the frontend (`phase0/ARCHITECTURE.md`); the client is a thin typed wrapper.
- Tenant scoping is enforced entirely by the backend (tenant derived from session, RLS `FORCE`);
  the frontend never sends a `tenantId`.
- Authorization stays backend-authoritative; the UI only reflects the authenticated session via
  `useAuth` and disables mutating controls until authenticated.

## Gates
- `vitest run` — **19/19 pass** (2 files: `api.test.ts`, `messages.test.ts`).
- `tsc --noEmit` — exit 0.
- `next build --webpack` — EXIT=0; route `ƒ /[locale]/clients` compiled (Turbopack still
  incompatible under the sandbox's proot/`--link2symlink`, so the webpack build remains the gate).

## Caveats for the gate
1. **Backend remains authoritative.** This is the UI follow-up only; it does not change Phase 5
   backend scope and does not re-open the migration-apply / HTTP e2e blockers already recorded in
   `PHASE5_COMPLETION_REVIEW.md`.
2. **List page focuses on the core profile.** It does not yet cover identifiers/ID documents,
   relationships, tags, notes, custom fields, consent, retention, portal flags, client documents,
   or communications — those remain Phase 5 follow-ups (backend-first), not defects.
3. **No full client timeline / client profile detail view yet** — deferred with the remaining
   follow-up scope.

## References
- `PHASE5_COMPLETION_REVIEW.md` §62-63 (frontend UI deferral)
- `PHASE5_CORE_DELIVERY_REVIEW.md` (back-end contract this UI consumes)
- `PHASE5_PLAN.md`
- `docs/phase4/PHASE4_CORE_DELIVERY_REVIEW.md` (frontend UI conventions precedent)
- `phase0/AUTHORIZATION.md` (frontend permissions are for UI only)
- `apps/web/src/lib/api.ts`, `apps/web/src/components/pages/clients/`, `apps/web/src/app/[locale]/clients/`

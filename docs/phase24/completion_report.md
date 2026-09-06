# Phase 24 Completion Report: Client Portal

**Date:** 2026-09-05
**Status:** Implemented, statically verified. NOT committed, NOT pushed (owner hold).
**Plan:** `docs/phase24/implementation_plan.md`.

## Delivered

### Identity linkage
- `Membership.clientId` + `Invitation.clientId` (nullable FKs); invitation
  create validates the client in-tenant (`UNKNOWN_CLIENT`); accept copies the
  link; `client` role + `CanAccessPortal` permission with matrix entry;
  reconcile ensures the client role row per tenant.

### Backend (`backend/api/src/portal/`, 5 files)
- Operations resolve the linked client at authorize time; unlinked members
  denied (`NO_LINKED_CLIENT`). Every query constrains to the linked client
  (hearings/deadlines via own case ids). Read-only: zero write endpoints.
- Versioned guarded controller (8 routes), module wired into `app.module.ts`.

### Schema + migration
- `20260908000004_phase24_portal_linkage` (2 columns + FKs + indexes, no new
  tables/RLS surface); `prisma validate` clean; RLS spec extended.

### Frontend (`apps/web`)
- `PortalClient` (8 methods) + 3 contract tests; `/[locale]/portal` route
  (compiled); nav item; `portal` i18n (en+ar parity); 5 sections with
  sign-in prompts (no silent blanks).

## Gates (executed)
| Gate | Result |
|---|---|
| Backend jest (portal/invitation/permissions) | 42/42 |
| Backend tsc | exit 0 (after client regen) |
| `nest build` | exit 0 |
| Web vitest | 87/87 |
| Web tsc | exit 0 |
| `next build --webpack` | exit 0 (`ƒ /[locale]/portal`) |
| Prettier | clean on authored files |

## Explicitly not done (owner side)
- Live `migrate deploy` + proof queries (same runbook)
- Client payments/notes, portal upload, portal MFA step-up

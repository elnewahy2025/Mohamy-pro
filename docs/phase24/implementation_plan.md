# Phase 24 Implementation Plan: Client Portal

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off.
**Plan date:** 2026-09-05
**Sources:** `Plan.txt` (المرحلة 24); `Client` model; invitation accept flow; `tenant.manager` precedent for least-privilege roles.

## User Review Required
> [!IMPORTANT]
> Portal users see strictly their own linked client's data. Membership gains an optional `clientId`; portal endpoints deny unlinked members entirely. Do you approve?

## Objective (Plan.txt)
Secure, limited portal for clients: login, secure invitation, authorized cases/documents/hearings/deadlines/messages/invoices only, tenant isolation intact.

## 1. Identity linkage (schema, additive)
- `Membership.clientId` (nullable FK → Client) + `Invitation.clientId` (nullable FK).
- Invitation create accepts optional `clientId` (validated in-tenant); accept copies it to the membership.
- New `client` role key + `CanAccessPortal` permission; matrix: client role = `[CanViewTenant, CanAccessPortal]`.
- Appointments = hearings of own cases (no new model; recorded mapping).

## 2. Backend (`backend/api/src/portal/`)
- `portal.errors.ts`, `portal.operations.ts` (authorize `CanAccessPortal` + resolve linked `clientId`; unlinked → deny), `portal.service.ts` (read-only scoped queries: cases, documents, hearings, deadlines, messages, invoices+payments, credits, agenda), `portal.controller.ts` (versioned, guarded), `portal.module.ts`.
- Every query constrains `clientId = membership.clientId` (cases/documents/invoices/credits/messages direct; hearings/deadlines/timeline via own case ids). No writes except nothing — portal is read-only (documented; payments/notes land in later phases).
- Audit: reads unaudited (consistent with other list endpoints).

## 3. Frontend
- `PortalClient` + tests; `/[locale]/portal` route; nav item; `portal` i18n (en+ar); sections: my cases, documents, invoices, messages, agenda.

## 4. Migration + RLS
- Additive `20260908000004_phase24_portal_linkage` (columns only, no new tables) + spec note.

## 5. Verification
- validate; tsc ×2; nest/next builds; jest (unlinked denied, cross-client denied, scoping per resource, invitation clientId validation); vitest; prettier.
- Live (owner): invite client-linked member → portal shows only own data.

## 6. Deferrals
Client payments/notes, portal document upload, push notifications, portal-specific MFA step-up beyond session default.

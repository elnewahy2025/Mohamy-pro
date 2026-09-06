# Phase 29 (Client Intake) — Delivery Review

Date: 2026-02-22 (UTC). Evidence-first; no external services touched.

## What was built

Backend `backend/api/src/intake/` (staff-assisted intake pipeline):

- `intake.service.ts` — create (linked conflict check must live in the tenant),
  list (`take:100`), get, `markInReview` (NEW → IN_REVIEW only).
- `conversion.service.ts` — `approve` (NEW/IN_REVIEW → APPROVED, creates the
  Client with `source: 'INTAKE'`, stamps `createdClientId`; settled requests
  rejected) and `reject` (reason mandatory). Case creation deliberately stays
  in the cases module — approve returns the client id.
- `intake.operations.ts` + `intake.controller.ts`
  (`POST/GET /v1/intake/requests`, `POST .../:id/review|approve|reject`,
  SessionGuard+CsrfGuard) + `intake.module.ts` → `app.module.ts`.
- Permission `CanManageIntake` (definition + TENANT_ADMIN matrix; reconciled at
  startup — consistent with reports).
- Audit `intake.created/reviewed/approved/rejected` at all registration sites
  incl. `METADATA_ALLOWLIST` (`created` carries `clientType` only).
- Migration `20260908000011_phase29_intake_foundation`: `IntakeRequest` table +
  `IntakeStatus` enum (ClientType reused), FORCE RLS + tenant-isolation policy,
  slice-verified complete.

Frontend `apps/web` (`/intake`, clientsParties nav, en+ar `intake` namespace):

- `IntakeClient` (submit/list/review/approve/reject) + 3 client tests.
- `intake-page.tsx` (submit / triage tabs), `submit-section`,
  `triage-section`; useAuth only, no permission gating.
- `messages.test.ts` navigation assertions extended with `intake`.

## Verification (evidence)

| Gate | Result |
| --- | --- |
| backend `tsc --noEmit` | 0 errors |
| backend full `jest` | **531/531** (incl. 8 intake specs; caught a missing |
| | `METADATA_ALLOWLIST` entry pre-merge — fixed, rerun green) |
| backend `nest build` | exit 0 |
| `prisma validate` | valid |
| web `tsc --noEmit` | 0 errors |
| web `vitest run` | **101/101** (incl. 3 IntakeClient tests) |
| web `next build --webpack` | exit 0 (`ƒ /[locale]/intake` present) |

## Independent re-audit (2026-02-22) — APPROVE, hardening applied

No P0 and no auth/tenant bypass. Applied before push:

- **P1 double-approve race**: `approve` now atomically claims via
  `updateMany({ id, tenantId, status ∈ REVIEWABLE, createdClientId: null })`
  and throws when the claim loses — no duplicate clients; spec covers the
  lost-race path (no client created, no follow-up update).
- **P2 composite keys**: terminal updates use `id_tenantId` (covered by
  `@@unique`) instead of bare `id` in intake + conversion services.
- **P2 pre-existing duplicate `CAN_MANAGE_EXPORTS` definition**: out of scope,
  left untouched.

Post-hardening gates: backend **532/532**, web **101/101**, both builds exit 0.

## Traceability

- `docs/phase29/PHASE29_DESIGN.md`, `tasklist.md`, this review.
- Nothing committed or pushed — awaiting independent re-audit + your approval
  per standing order.

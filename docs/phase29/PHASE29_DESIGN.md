# Phase 29 (Client Intake) — Design

Staff-assisted intake pipeline: prospects are registered as intake requests,
triaged, optionally linked to a conflict check, then approved (creates the
Client with `source: 'INTAKE'`) or rejected with a reason. Case creation stays
in the cases module (clean boundary — approve returns the new client id).

## Backend `backend/api/src/intake/`

- `intake.errors.ts` — access-denied / not-found / invalid-state errors.
- `intake.dto.ts` — `CreateIntakeDto` (fullName, clientType enum, matterSummary,
  optional email/phone/source/conflictCheckId), `ReviewIntakeDto` (notes),
  `ApproveIntakeDto` (notes), `RejectIntakeDto` (reason required).
- `intake.service.ts` — create (validates linked conflict check lives in the
  tenant), list (`take:100`), get, `markInReview` (NEW → IN_REVIEW + reviewer).
- `conversion.service.ts` — `approve` (NEW/IN_REVIEW → APPROVED, creates Client,
  stamps `createdClientId`; double-approve rejected), `reject` (NEW/IN_REVIEW →
  REJECTED, reason required).
- `intake.operations.ts` — `authorize()` on new `CanManageIntake` permission
  (fail-closed), `run()` with audit events, `read()` under tenant context.
- `intake.controller.ts` — `POST/GET /v1/intake/requests`,
  `POST /v1/intake/requests/:id/review|approve|reject`; SessionGuard+CsrfGuard.
- `intake.module.ts` → `app.module.ts`.
- Permission: `CAN_MANAGE_INTAKE` in `permission.constants.ts` (definition +
  TENANT_ADMIN matrix; reconciled at startup, no seed migration).
- Audit: `INTAKE_CREATED/APPROVED/REJECTED` at all 4 registration sites.
- Migration `20260908000011_phase29_intake_foundation`: `IntakeRequest` table +
  `IntakeStatus` enum, FORCE RLS + tenant-isolation policy, slice-verified.

## Frontend `apps/web` (`/intake`, clientsParties nav, `intake` namespace en+ar)

- `IntakeClient` + tests, `intake-page.tsx` (submit / triage tabs),
  `submit-section`, `triage-section` (review/approve/reject with result display).
- useAuth only; `messages.test.ts` extended.

## Verification

backend tsc + full jest + nest build + prisma validate; web tsc + vitest +
next build --webpack; independent re-audit; commit/push only on approval.

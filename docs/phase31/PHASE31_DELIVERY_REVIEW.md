# Phase 31 (Integration Hub Completion) — Delivery Review

Date: 2026-02-22 (UTC). Evidence-first; no external services touched.

## What was built

Backend `backend/api/src/integrations/` — the registry prior phases deferred to:

- `registry.service.ts` — per-(tenant,key) upsert for 8 allowlisted keys
  (GOOGLE/MS CALENDAR, EMAIL, SMS, WHATSAPP, PUSH, PAYMENT_PSP,
  E_INVOICE_ZATCA); config objects capped (20 keys, 500-char string values)
  with secret-like keys rejected (Vault owns secrets when wired); `health()`
  reads our own rows only — no fake probing.
- `webhook.service.ts` — endpoint registry (https-only, localhost-http
  exception; 1–10 catalog events); secrets generated (32B), returned ONCE,
  stored as SHA-256; listings redact the hash (`hasSecret` flag); terminal
  rotate (enabled only) and disable.
- `integrations.operations.ts` + `integrations.controller.ts`
  (`PUT /v1/integrations/:key` with `@IsIn` param validation,
  `GET /health|/events`, `POST/GET webhooks`, `POST webhooks/:id/rotate|disable`;
  SessionGuard+CsrfGuard) + module → `app.module.ts`.
- Permission `CanManageIntegrations` (definition + TENANT_ADMIN matrix).
- Audit `integration.configured`, `webhook.registered/rotated/disabled` at
  all 5 registration sites.
- Migration `20260908000013_phase31_integrations_foundation`: `Integration` +
  `WebhookEndpoint` + both status enums, FORCE RLS + policies, slice-verified.
- Explicit non-goal: no live provider calls, no delivery dispatch (deferred
  with the calendar/comms/billing providers); no deliveries table ships.

Frontend `apps/web` (`/integrations` rebuilt as hub UI, extended `integrations`
namespace en+ar):

- Static infra-ports table removed (it described docker, not product
  integrations); `integrations-page.tsx` now hosts `connections-section`
  (health + enable/disable), `webhooks-section` (register/rotate/list; secret
  shown once via result field, never refetchable), `catalog-section`.
- `IntegrationsClient` + 3 client tests. Nav entry pre-existed.

## Verification (evidence)

| Gate | Result |
| --- | --- |
| backend `tsc --noEmit` | 0 errors |
| backend full `jest` | **545/545** (incl. 7 integrations specs) |
| backend `nest build` | exit 0 |
| `prisma validate` | valid |
| web `tsc --noEmit` | 0 errors |
| web `vitest run` | **107/107** (incl. 3 IntegrationsClient tests) |
| web `next build --webpack` | exit 0 (`ƒ /[locale]/integrations` present) |

## Independent re-audit — APPROVE, findings closed

No P0. Four findings, all addressed before push:

- **P1 (invalid as stated)**: auditor claimed no RLS spec block — it exists
  (`migration-rls.spec.ts:401`, green in the suite). No change needed.
- **P2 DTO depth**: `events` now validated at the boundary too
  (`@ArrayMinSize(1) @ArrayMaxSize(10) @IsIn(WEBHOOK_EVENTS, each)`) in
  addition to the service check.
- **P2 regex gap**: secret-like pattern extended to
  `credential|auth|access[_-]?key` alongside the existing alternatives.
- **P2 terminal disable**: confirmed intentional — a disabled endpoint is
  re-registered, never resurrected; no re-enable path by design.

Post-remediation gates: backend **545/545**, web **107/107**, both builds exit 0.

## Traceability

- `docs/phase31/PHASE31_DESIGN.md`, `tasklist.md`, this review.
- Nothing committed or pushed — awaiting independent re-audit + your approval
  per standing order.

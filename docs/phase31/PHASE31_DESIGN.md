# Phase 31 (Integration Hub Completion) — Design

Central registry for external integrations: connection records, webhook
endpoint registry with one-time secrets (hash-stored), and a subscribable
event catalog. No live third-party calls — live providers stay deferred per
prior phase plans (calendar §7, comms/billing providers); the hub records
intent and configuration so providers plug in later. No secrets at rest:
endpoint secrets are shown once and stored as SHA-256 hashes; integration
`config` rejects secret-like keys (Vault owns secrets when wired).

## Backend `backend/api/src/integrations/`

- `integrations.errors.ts` — access-denied / not-found / invalid-state.
- `integrations.dto.ts` — `INTEGRATION_KEYS` (GOOGLE_CALENDAR,
  MICROSOFT_CALENDAR, EMAIL, SMS, WHATSAPP, PUSH, PAYMENT_PSP,
  E_INVOICE_ZATCA), `SetIntegrationDto` (key ∈ allowlist, enabled bool,
  config object ≤20 string-valued keys ≤500 chars, secret-like keys rejected),
  `RegisterWebhookDto` (https URL — http allowed only for localhost —,
  events[] ⊆ `WEBHOOK_EVENTS` catalog, 1–10 entries), `RotateWebhookDto`
  (empty; rotation is an explicit action).
- `registry.service.ts` — upsert-per-(tenant,key) + list (`take:100`) +
  `health()` (per-key status/error/updatedAt read from our own rows only —
  no fake probing).
- `webhook.service.ts` — register (generates 32-byte secret, returns plaintext
  ONCE, stores `hashToken`), list redacted (`hasSecret`, never the hash),
  rotate (new secret once), disable (ENABLED → DISABLED; terminal).
- `integrations.operations.ts` — `authorize()` on new `CanManageIntegrations`
  (fail-closed); `run()` audited; `read()` under tenant context.
- `integrations.controller.ts` — `PUT /v1/integrations/:key`,
  `GET /v1/integrations`, `GET /v1/integrations/health`,
  `GET /v1/integrations/events`, `POST/GET /v1/integrations/webhooks`,
  `POST /v1/integrations/webhooks/:id/rotate|disable`.
  SessionGuard+CsrfGuard.
- Permission `CanManageIntegrations` (definition + TENANT_ADMIN matrix).
- Audit `INTEGRATION_CONFIGURED`, `WEBHOOK_REGISTERED/ROTATED/DISABLED` at
  all 5 registration sites.
- Migration `20260908000013_phase31_integrations_foundation`: `Integration`
  (+ `@@unique([tenantId, key])`), `WebhookEndpoint`, FORCE RLS + policies,
  slice-verified. No deliveries table — dispatch is the deferred follow-up.

## Frontend `apps/web` (`/integrations` rebuilt as hub UI, `integrations` ns)

- Existing static infra page becomes the live hub: `integrations-page.tsx`
  (connections / webhooks / catalog tabs) + `connections-section`,
  `webhooks-section` (shows one-time secret once, never refetchable),
  `catalog-section`; `IntegrationsClient` + tests. Infra table removed
  (it described docker ports, not product integrations; dropped deliberately).
- `messages.test.ts` untouched unless keys change (namespace extended, nav
  already has `integrations`).

## Verification

backend tsc + full jest + nest build + prisma validate; web tsc + vitest +
next build --webpack; independent re-audit; commit/push only on approval.

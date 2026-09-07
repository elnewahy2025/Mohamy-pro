# Phase 32 (AI Layer) — Design

Per architecture: optional intelligence, never a dependency; platform-defined
contracts; permission-aware retrieval; human approval before AI output becomes
an official record. No live provider in v1 (no keys in this env) — requests
are recorded, refs validated, retrieval scoped; execution fills `outputText`
when a provider adapter lands. Nothing fabricates output: approval requires
status READY (output present), enforced server-side.

## Backend `backend/api/src/ai/`

- `ai.errors.ts` — access-denied / not-found / invalid-state (+ provider
  unavailable for the deferred adapter).
- `ai.dto.ts` — `TASK_TYPES` (DOCUMENT_SUMMARY, CASE_BRIEF, DEADLINE_DIGEST,
  INTAKE_TRIAGE, HEARING_PREP), `REF_KINDS` (CASE, DOCUMENT, INTAKE,
  DEADLINE); `CreateAiRequestDto` (taskType ∈ allowlist, refs 1–10 ×
  {kind ∈ allowlist, id UUID}, promptHint ≤2000 optional);
  `ReviewAiRequestDto` (notes optional), `RejectAiRequestDto` (reason req).
- `ai-provider.interface.ts` — `AiProvider.execute(input): Promise<AiOutput>`
  contract; NO live implementation (mirrors calendar-provider deferral).
- `request.service.ts` — create (validates every ref resolves in-tenant via
  scoped lookups; stores refs only, never content), list (`take:100`), get.
- `review.service.ts` — `approve` (READY → APPROVED + reviewer; rejects
  QUEUED/FAILED/settled — no approval of empty output), `reject`
  (QUEUED/READY → REJECTED, reason mandatory). Terminal updates via composite
  `id_tenantId`.
- `retrieval.service.ts` — `resolveRefs()` used at create-validation AND
  exposed for the future executor: maps each ref through tenant scope +
  ASSIGNED case filter (case-derived kinds), returning allowlisted scalar
  snapshots only. Single source of scope truth.
- `ai.operations.ts` — `authorizeCaseAccess(CAN_MANAGE_AI)` (FULL/ASSIGNED,
  fail-closed); `run()` audited; `read()` under tenant context.
- `ai.controller.ts` — `POST/GET /v1/ai/requests`, `GET /v1/ai/requests/:id`,
  `POST /v1/ai/requests/:id/approve|reject`. SessionGuard+CsrfGuard.
- Permission `CanManageAI` (definition + TENANT_ADMIN matrix; ASSIGNED
  lawyers flow through `CanAccessAssignedCases`).
- Audit `AI_REQUESTED/APPROVED/REJECTED` at all 5 registration sites.
- Migration `20260908000014_phase32_ai_foundation`: `AiRequest` +
  `AiRequestStatus`, FORCE RLS + policy, slice-verified.

## Frontend `apps/web` (`/ai`, workspace nav, `ai` namespace en+ar)

- `AiClient` + tests; `ai-page.tsx` (request / review tabs); `request-section`
  (task type + refs), `review-section` (list + approve/reject with output
  display, empty-output warning).
- useAuth only; `messages.test.ts` extended.

## Verification

backend tsc + full jest + nest build + prisma validate; web tsc + vitest +
next build --webpack; independent re-audit; commit/push only on approval.

# Phase 32 (AI Layer) — Delivery Review

Date: 2026-02-22 (UTC). Evidence-first; no external services touched.

## What was built

Backend `backend/api/src/ai/` — the platform-defined gateway from the
architecture (§AI Layer: optional intelligence, never a dependency;
permission-aware retrieval; human approval before output becomes record):

- `request.service.ts` — create (taskType allowlisted, every ref resolved
  in-tenant/scope before persist; stores refs only, never content; starts
  QUEUED with null output), list (`take:100`), get.
- `retrieval.service.ts` — single scope-truth: resolves CASE/DOCUMENT/INTAKE/
  DEADLINE refs through tenant + ASSIGNED case filter into allowlisted scalar
  snapshots (no tokens/hashes/payloads); used at create-validation and exposed
  for the future executor.
- `review.service.ts` — `approve` requires READY **and** non-empty output
  (double fail-closed: QUEUED/FAILED/settled can never be approved);
  `reject` requires QUEUED/READY with mandatory reason; composite
  `id_tenantId` updates.
- `ai-provider.interface.ts` — provider contract with NO live implementation
  (mirrors the calendar-provider deferral; SDK calls banned elsewhere).
- `ai.operations.ts` (`authorizeCaseAccess(CAN_MANAGE_AI)` FULL/ASSIGNED) +
  `ai.controller.ts` (`POST/GET /v1/ai/requests`, `GET :id`,
  `POST :id/approve|reject`; SessionGuard+CsrfGuard) + module → app.module.
- Permission `CanManageAI` (definition + TENANT_ADMIN matrix; ASSIGNED
  lawyers flow via `CanAccessAssignedCases`).
- Audit `ai.requested/approved/rejected` at all 5 registration sites.
- Migration `20260908000014_phase32_ai_foundation`: `AiRequest` +
  `AiRequestStatus`, FORCE RLS + policy, slice-verified complete.

Frontend `apps/web` (`/ai`, workspace nav, en+ar `ai` namespace):

- `AiClient` + 2 client tests; `ai-page.tsx` (request / review tabs) with
  `request-section` (KIND:id ref parsing) and `review-section` (output display
  with empty-output notice); useAuth only.
- `messages.test.ts` navigation assertions extended with `ai`.

## Verification (evidence)

| Gate | Result |
| --- | --- |
| backend `tsc --noEmit` | 0 errors |
| backend full `jest` | **557/557** (incl. 12 AI specs) |
| backend `nest build` | exit 0 |
| `prisma validate` | valid |
| web `tsc --noEmit` | 0 errors |
| web `vitest run` | **109/109** (incl. 2 AiClient tests) |
| web `next build --webpack` | exit 0 (`ƒ /[locale]/ai` present) |

## Independent re-audit — CHANGES REQUIRED, all closed

One P1 + two P2s, all verified real and fixed before push:

- **P1 read-path scope leak**: `list`/`get` filtered by tenant only, letting
  ASSIGNED readers enumerate out-of-scope requests. Both now take the
  `RetrievalScope`: under ASSIGNED, `list` keeps only requests whose refs all
  resolve in-scope and `get` maps out-of-scope to non-enumerating not-found;
  FULL path untouched. Specs cover hide-on-list, 404-on-get, FULL passthrough.
- **P2 unlinked-document bypass**: `DOCUMENT` refs with null `caseId` skipped
  the ASSIGNED check. Now denied under ASSIGNED (allowed under FULL); specs
  cover both.
- **P2 unused import**: dropped `IsObject` from `ai.dto.ts`.

Post-remediation gates: backend **562/562**, web **109/109**, both builds exit 0.

## Traceability

- `docs/phase32/PHASE32_DESIGN.md`, `tasklist.md`, this review.
- Nothing committed or pushed — awaiting independent re-audit + your approval
  per standing order.

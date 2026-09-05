# Phase 22 Implementation Plan: Communications

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off.
**Plan date:** 2026-09-05
**Sources:** `Plan.txt` §846+ (المرحلة 22); existing `Case`/`Client`/`Task` links, `storageObjectId` attachment pattern (Phase 15), `CaseTimelineEventType.NOTE_ADDED` (declared, never emitted).

## User Review Required
> [!IMPORTANT]
> No real message is ever sent in this phase: outbound messages persist as `QUEUED` and provider adapters fail closed. Sending via Email/SMS/WhatsApp providers lands with their owning integrations. Do you approve the schema additions and this plan?

## Objective (Plan.txt)
Unified, extensible communication hub: provider adapters, message history, inbound/outbound flow. Closing conditions: core never talks to a specific provider; every message linkable to a client, case, or task.

## 1. Database Schema
### [MODIFY] `backend/api/prisma/schema.prisma`
- `MessageThread` (tenantId; subject?; caseId?/clientId?/taskId? links; status OPEN|CLOSED; timestamps)
- `Message` (tenantId; threadId?; channel EMAIL|SMS|WHATSAPP|PHONE|INTERNAL|PORTAL; direction INBOUND|OUTBOUND; status QUEUED|SENT|DELIVERED|FAILED|READ; subject?; body Text; caseId?/clientId?/taskId?; error?; sentAt?; timestamps)
- `MessageAttachment` (tenantId; messageId; storageObjectId; mimeType; fileSize; timestamps)
- `MessageConsent` (tenantId; clientId; channel; status OPT_IN|OPT_OUT; decidedAt; `@@unique([tenantId, clientId, channel])`)
### Enums
`CommunicationChannel`, `MessageDirection`, `MessageStatus`, `ThreadStatus`, `ConsentStatus`.
### Hard rules
- Outbound create requires consent: client OPT_OUT on the channel → reject (no consent row = allowed, recorded explicitly as default-allow for INTERNAL/PORTAL, default-allow with logged warning for external channels).
- `QUEUED` is terminal until a provider exists; only explicit status recording (`SENT→DELIVERED/FAILED/READ`) moves it; no fake delivery.
- Every message must link to at least one of case/client/task (enforced in service).

## 2. Backend Module
### [NEW] `backend/api/src/communications/`
- `communications.errors.ts`, `communications.dto.ts` (validated; no `any`), `communications.operations.ts` (permission-keyed authorize + run/read)
- `thread.service.ts`, `message.service.ts` (compose, consent check, link validation), `consent.service.ts`, `delivery.service.ts` (explicit status recording with error capture)
- `communication-provider.interface.ts` — `send()` contract only; zero implementations (fail-closed by absence)
- `communications.controller.ts` — `@Controller({ path: 'communications', version: '1' })`, guards on everything
- `communications.module.ts` (imports Database, Audit, Permissions, Auth, CaseTimeline modules)
### Permissions
- `CanManageCommunications` (compose, read, record delivery, manage consent; tenant.admin only — least privilege, recorded)
### Timeline + audit
- Emit `NOTE_ADDED` for INTERNAL/PORTAL messages carrying a caseId (closes another Phase-10 gap)
- Audit: `message.queued`, `message.status.recorded` (+ maps + allowlist)

## 3. API Endpoints (all `/api/v1/communications`, paginated lists)
- `POST /threads`, `GET /threads?caseId=&clientId=`; `POST /threads/:id/close`
- `POST /messages` (outbound→QUEUED w/ consent check; inbound recorded with status), `GET /messages?threadId=&caseId=&clientId=&channel=`
- `POST /messages/:id/status` (explicit SENT|DELIVERED|FAILED|READ + error)
- `POST /messages/:id/attachments`, `GET /messages/:id/attachments`
- `POST /consents`, `GET /consents?clientId=`

## 4. Frontend
- `CommsClient` + tests; `/[locale]/communications` route; matters-group nav; `communications` i18n (en+ar)
- Sections: threads, compose (message), inbox list, delivery recorder, attachments, consent manager

## 5. Migration + RLS
- Additive `20260908000002_phase22_communications_foundation` + FORCE RLS ×4 + spec extension

## 6. Verification
- validate; slice-completeness; tsc ×2; nest/next builds; jest (consent enforcement, link requirement, status machine, thread close); vitest client tests; prettier
- Live (owner): compose thread → outbound QUEUED; opt-out blocks send; status record → history; attachment metadata roundtrip

## 7. Deferrals (recorded, not silent)
Real provider sending (Email/SMS/WhatsApp), inbound webhooks, portal delivery, AI drafting/summarization (Phase 32), push notifications (Phase 26).

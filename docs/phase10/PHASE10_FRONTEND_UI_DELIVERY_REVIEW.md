# Phase 10 — Case Timeline Frontend UI (Delivery Review)

> **Status:** DELIVERED — Phase 10 frontend UI, the "UI timeline rendering" deferral recorded (not
> silent) in `PHASE10_PLAN.md` and `PHASE10_CORE_DELIVERY_REVIEW.md`. This delivery adds the
> frontend for the Phase 10 Case Timeline (append-only, chronological, tenant-scoped history for a
> case). It mirrors the Phase 4/5/6/7/8/9 frontend follow-ups.
> **Performed against:** local `main` working tree in `apps/web`.
> **Workspace:** `/root/Mohamy-pro-backup` (canonical clone).
> **Verification:** `vitest run` 46/46 (2 files) · `tsc --noEmit` exit 0 · `next build --webpack`
> EXIT=0 (route `ƒ /[locale]/cases` compiled with the new timeline section).

---

## Scope delivered

The Phase 10 backend core delivery deferred UI timeline rendering to a follow-up. This delivery
closes that follow-up against the existing `case-timeline/` backend contract:

1. **Timeline client** — two typed methods added to `CasesClient` in `apps/web/src/lib/api.ts`:
   - `getTimeline(caseId, query)` → `GET /cases/:caseId/timeline` (paginated),
   - `appendTimelineEvent(req)` → `POST /cases/:caseId/timeline`.
2. **Schema-aligned types** — `CaseTimelineEventType` union (all 13 enum members),
   `CaseTimelineEvent` (mirrors the Prisma `CaseTimelineEvent` model: id, tenantId, caseId,
   eventType, occurredAt, actor refs, JSON payload, timestamps), `CaseTimelineListResult`
   (`{ data, pagination }`), `CreateCaseTimelineEventRequest`, `ListCaseTimelineQuery`.
3. **Case timeline section** — a new `CaseTimelineSection` component rendered on the existing
   `/[locale]/cases` page, matching the other case sections' self-contained pattern (manual case-ID
   input + result display).
4. **i18n** — a full `casesTimeline` namespace (en + ar, structurally identical), including a
   display label for every one of the 13 event types.

## What was built

### API client (`apps/web/src/lib/api.ts`)
- `CaseTimelineEventType` union mirrors the `CaseTimelineEventType` Prisma enum exactly
  (`CASE_CREATED`, `CLIENT_ADDED`, `PARTY_ADDED`, `DOCUMENT_UPLOADED`, `TASK_CREATED`,
  `HEARING_SCHEDULED`, `DEADLINE_CREATED`, `STATUS_CHANGED`, `NOTE_ADDED`, `INVOICE_CREATED`,
  `PAYMENT_RECEIVED`, `DOCUMENT_APPROVED`, `CASE_CLOSED`).
- `CaseTimelineEvent` mirrors the model (including nullable `actorUserId` /
  `actorMembershipId` and nullable JSON `payload`).
- `getTimeline` sends `page`/`limit` query params (offset pagination, default limit 20, max 100);
  `appendTimelineEvent` posts `{ eventType, payload? }` (opaque `caseId` in the path). Route mapping
  verified against `case-timeline.controller.ts` / `case-timeline.dto.ts`.

### UI component (`apps/web/src/components/pages/cases/case-timeline-section.tsx`)
Follows the established `useAuth` + react-hook-form + zod + `FormField` + `OperationResult` +
`Button` conventions. Two sub-forms:
- **Load timeline** — enter a case ID; fetches the paginated, chronological list and renders each
  event's localized label, ISO timestamp, raw type, and id, with Previous/Next paging.
- **Append event** — enter a case ID, an event type (text input matched against the enum, per the
  codebase convention for enum fields), and an optional JSON payload. Empty payload is omitted;
  non-empty payload is parsed as JSON before posting (a malformed payload surfaces as an `ApiError`).

No client-side permission gating — mutating controls are disabled until authenticated; the backend
enforces `CanViewCaseTimeline` via `authorize()` and RLS (established convention, "frontend
permissions are for UI only").

### i18n
- `apps/web/messages/en.json` / `ar.json` — new `casesTimeline` namespace (top-level:
  `eyebrow`, `title`, `description`, `list`, `append`, `submitting`, `labels`, `placeholders`,
  `result`, `pagination`, `events`, `sections`), structurally identical across locales (verified).
- The `events` object provides a display label for each of the 13 enum values (e.g.
  `STATUS_CHANGED` → "Status changed" / "تغيّرت الحالة"). The list renderer uses `t.has()` to fall
  back to the raw enum string if a key were ever absent.

### Tests
`CaseTimelineClient (Phase 10)` — 2 cases in `apps/web/src/lib/api.test.ts`:
1. lists a case timeline via `GET /cases/:caseId/timeline` with `page`/`limit`,
2. appends a timeline event via `POST /cases/:caseId/timeline` including a JSON payload.

Uses the same CSRF-stubbed handler-map `clientWith` helper as the prior phase blocks (handlers keyed
by path suffix, disambiguating list vs. append by HTTP method).

## Security & isolation notes
- No business logic in the frontend (`phase0/ARCHITECTURE.md`); the client is a thin typed wrapper.
- Timeline scoping is backend-only: `listTimeline`/`recordEvent` verify the case belongs to the
  active tenant (RLS `FORCE` + app-layer `recordEvent` tenant check, including the R3 remediation
  that rejects appending to a case outside the tenant). The frontend never sends a `tenantId`.
- Append-only immutability is enforced on the backend (insert-only; no update/delete endpoints).
  The frontend exposes read (`getTimeline`) and explicit append (`appendTimelineEvent`) only.
- The payload is user-supplied JSON on an explicit append; it's passed through as-is and the object
  is expected to be non-sensitive per the backend contract.

## Gates (evidence)

| Gate | Result |
|---|---|
| `vitest run` | ✅ **46/46** (2 files: `api.test.ts`, `messages.test.ts`) |
| `tsc --noEmit` | ✅ exit 0 |
| `next build --webpack` | ✅ EXIT=0; `/[locale]/cases` compiled with the timeline section |

## Caveats for the gate
1. **Backend remains authoritative.** This is the UI follow-up only; it does not change the Phase 10
   backend scope (sealed in `PHASE10_CORE_DELIVERY_REVIEW.md`).
2. **Only 3 event types are emitted today.** The backend currently auto-emits `CASE_CREATED`,
   `STATUS_CHANGED`, and `PARTY_ADDED`; the other 10 enum members (`CLIENT_ADDED`,
   `DOCUMENT_UPLOADED`, `TASK_CREATED`, `HEARING_SCHEDULED`, `DEADLINE_CREATED`, `NOTE_ADDED`,
   `INVOICE_CREATED`, `PAYMENT_RECEIVED`, `DOCUMENT_APPROVED`, `CASE_CLOSED`) are declared in the
   schema/type union but are not yet emitted by their owning phases (11-21). The UI renders whatever
   is in the timeline and labels all 13 types pre-emptively; a declared-but-unemitted type simply
   won't appear until its phase lands.
3. **Explicit appends require prior case creation.** The timeline `POST` validates the case exists
   in the tenant, so a user must supply a valid case ID; there is no case picker (matching the
   self-contained section pattern used by the other case sections).
4. **No date/type filtering.** The backend timeline read endpoint exposes only page/limit (no
   event-type or date-range filters — a recorded Phase 10 deferral), so the UI offers none.

## References
- `PHASE10_PLAN.md` (UI timeline rendering deferral and the event catalog)
- `docs/phase10/PHASE10_CORE_DELIVERY_REVIEW.md` (sealed backend core delivery + R3/R5 remediation)
- `docs/phase9/PHASE9_FRONTEND_UI_DELIVERY_REVIEW.md` (frontend follow-up precedent)
- `phase0/AUTHORIZATION.md` (frontend permissions are for UI only)
- `apps/web/src/lib/api.ts`, `apps/web/src/components/pages/cases/case-timeline-section.tsx`,
  `apps/web/src/components/pages/cases/cases-page.tsx`, `apps/web/messages/{en,ar}.json`

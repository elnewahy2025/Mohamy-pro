# Phase 26 Implementation Plan: Notifications

**Plan status:** DRAFT for owner review. Execution authorized only after owner sign-off.
**Plan date:** 2026-09-05
**Sources:** `Plan.txt` (المرحلة 26); existing `@Cron` scheduler, comms channel enums, audit maps.

## User Review Required
> [!IMPORTANT]
> Only in-app delivery is real in this phase; Email/SMS/WhatsApp/Push rules are rejected at creation until their providers land (fail-closed). Auto-triggers wire into invoice issue + hearing create only. Do you approve?

## Objective (Plan.txt)
Multi-channel notification management with rules, preferences, reminders, escalations, quiet hours. Closing: notifications never exceed user preferences.

## 1. Database Schema
- `NotificationRule` (tenantId; eventType INVOICE_ISSUED|HEARING_SCHEDULED|DEADLINE_CREATED; channels[] — IN_APP only until providers land; audience ASSIGNEES|ALL_MEMBERS; enabled; escalationHours?; escalateToMembershipId?)
- `Notification` (tenantId; membershipId recipient; title; body; channel IN_APP; status PENDING|SENT|READ|FAILED; relatedType?; relatedId?; scheduledFor?; sentAt?; readAt?)
- `NotificationPreference` (tenantId; membershipId; channel; enabled; quietStart?; quietEnd?; `@@unique([tenantId, membershipId, channel])`)
### Enums
`NotificationEvent`, `NotificationChannel`, `NotificationStatus`, `NotificationAudience`.
### Hard rules
- Non-IN_APP channels rejected at rule creation (explicit, no silent drops).
- Quiet hours: sends inside the window are scheduled for window end, never dropped.
- Escalation: unacknowledged notifications past `escalationHours` generate a second notification to the rule owner (sweep job).
- Preferences default-allow; explicit disable wins (closing condition).

## 2. Backend (`backend/api/src/notifications/`)
- `notification.errors.ts`, `notification.dto.ts`, `notification.operations.ts`
- `rule.service.ts`, `preference.service.ts`, `dispatch.service.ts` (rule match → audience resolve → preference/quiet-hours filter → create SENT in-app)
- `reminder.scheduler.ts` (`@Cron` hourly: due PENDING → SENT; escalations)
- `notification.controller.ts` (versioned, guarded), `notification.module.ts`
- Triggers (best-effort, never fail the operation): invoice issue, hearing create.

## 3. Permissions + audit
- `CanManageNotifications` (tenant.admin); inbox/preferences session-scoped (no key).
- Audit: `notification.rule.created/updated`, `notification.sent`.

## 4. Frontend
- `NotificationsClient` + tests; workspace-group nav; `notifications` i18n (en+ar); sections: inbox (read/unread), preferences (per-channel + quiet hours), rules admin.

## 5. Migration + RLS
- Additive `20260908000009_phase26_notifications_foundation` + FORCE RLS ×3 + spec extension.

## 6. Verification
- validate; slice-completeness; tsc ×2; nest/next builds; jest (preference filtering, quiet hours, escalation, trigger wiring, channel rejection); vitest; prettier.
- Live (owner): rule → invoice issue → inbox receives; disable channel → suppressed; quiet hours → deferred.

## 7. Deferrals
Email/SMS/WhatsApp/Push providers, push tokens, digest batching, portal notifications, AI prioritization.

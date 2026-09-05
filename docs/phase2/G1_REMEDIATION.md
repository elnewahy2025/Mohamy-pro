# G1 Scaffold Controllers — Remediation + Re-audit (APPROVED)

**Scope:** G1 only (AUTHORIZATION_GAPS.md G1). No G2–G10 code. Uncommitted unless approved.

## Backend fix (time-tracking pattern)

All six controllers: applied `@UseGuards(SessionGuard, CsrfGuard)`, versioned
`@Controller({ path, version: '1' })`, session-derived `{tenantId, userId}`,
`'system'` fallbacks and false security comments removed:
- `templates/template.controller.ts`, `template-generation.controller.ts`
  (+ AuthModule; idempotency-header type narrowing)
- `search/search.controller.ts` (+ AuthModule; roles honestly `[]`)
- `search/admin-search.controller.ts` (+ AuthModule, PermissionsModule;
  platform-admin gate via `hasGlobalPermission(CanGrantPlatformAdmin)`)
- `documents/ocr/ocr.controller.ts` (+ AuthModule)
- `documents/security/document-security.controller.ts` (+ AuthModule; signed
  URL corrected to `/api/v1/…`)

## Frontend verification (gate correction adopted 2026-09-05)

Principle: frontend authorization is never a security control, but frontend
behavior must be consistent with the backend contract. Verified:
- URL preservation: versioned paths resolve to the exact same
  `/api/v1/…` URLs as the old literals (no frontend caller changes needed;
  only `DocumentsClient` secure-link methods call these routes).
- Live route proof (prod boot, unauthenticated POST): all six return 403
  (guard rejection — mounted + enforced), control `workflows` 403 identical,
  `/api/v1/v1/templates` 404 (no double-versioning).
- Error path: `PermissionDeniedError` is 403/FORBIDDEN with generic message
  (unchanged); `ApiError → OperationResult` renders error state, never success
  or data (verified `document-secure-link-section.tsx` + `operation-result.tsx`).
- No frontend change required — recorded as the correct outcome, not an omission.
- Web gates: vitest 74/74, tsc exit 0.

## Independent re-audit

Fresh sweep: zero unguarded controllers except `health` (public by design)
and `metrics` (token-checked, verified); zero `req.tenantId` / `'system'`
in controllers; zero dead guard imports. Guard spec extended to all six:
18/18 pass. tsc 0, nest build 0, prod boot clean + health ok.

## Verdict: G1 PASS (implementation + independent re-audit)

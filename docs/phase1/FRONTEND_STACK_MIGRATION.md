# Finding 3 — Frontend Stack Alignment

## Decision

The undocumented Vite/React Router divergence has been corrected by migrating the frontend to the frozen Phase 0 architecture rather than revising the governing requirement. The frontend now uses Next.js 16.3.1, React 19, the App Router, TypeScript, Tailwind CSS v4, a shadcn-compatible Button primitive, TanStack Query, React Hook Form, Zod, `next-intl`, and locale-prefixed routing.

## Implementation

The old Vite entrypoint, React Router routes, and client-only locale context were removed. The authoritative application now lives under `apps/web/src/app/[locale]/` with localized App Router pages for overview, operations, integrations, and settings. `src/proxy.ts` enforces `/en` and `/ar` locale prefixes, while `src/i18n/request.ts` loads the matching JSON message catalog.

The locale layout sets the document language and direction, provides server-loaded messages through `NextIntlClientProvider`, and mounts a configured TanStack Query client. The settings page uses React Hook Form and Zod for validated locale state, and the shell uses the generated next-intl navigation helpers to switch locale without losing the current route.

The existing English and Arabic content, responsive shell, navigation, accessibility labels, and RTL/LTR CSS behavior were preserved. A shadcn-style typed Button primitive and Tailwind v4/PostCSS configuration now provide the approved UI foundation instead of a Vite-only CSS/runtime boundary.

## Validation evidence

| Check | Result |
|---|---|
| Frozen pnpm installation | Passed with pnpm 11.22.0. |
| Vite/React Router references | No remaining implementation references; only the intentional Vitest test runner remains. |
| Frontend unit tests | Passed: 1 file, 2 tests covering message-tree parity and bilingual navigation/direction labels. |
| Next.js production build | Passed with Next.js 16.3.1; TypeScript completed successfully and localized routes were generated. |
| Full repository test suite | Passed: API 3 suites/9 tests and frontend 1 file/2 tests. |
| Full repository production build | Passed: API Nest build and Next.js frontend build. |
| Built route checks | English/Arabic settings returned HTTP 200; the root request redirected to `/en`; locale-prefixed overview requests reached canonical trailing-slash redirects. |
| RTL/LTR contract | Arabic layout renders `lang="ar" dir="rtl"`; English layout renders `lang="en" dir="ltr"`. |

## Boundary and remaining work

This finding addresses the frozen frontend stack divergence. The audit’s separate generated OpenAPI-client gap remains a distinct contract/CI item and has not been silently represented as complete by this migration. The frontend currently consumes localized application content and does not invent business rules or claim backend data it does not fetch.

Finding 1 is closed with the accepted legacy Windows migration state documented in [`MIGRATION_BASELINE_RECONCILIATION.md`](MIGRATION_BASELINE_RECONCILIATION.md) and the clean disposable migration evidence. Finding 2 is closed for the Phase 1 Windows runtime boundary through the real PostgreSQL/Redis e2e, readiness, rate-limit, and outbox evidence. The generated API-client decision remains a separate documented deferral. Phase 2 product work remains paused.

## References

1. [`Frozen Phase 0 stack`](../phase0/STACK.md)
2. [`Phase 1 audit report`](AUDIT_REPORT.md)
3. [`Phase 1 remediation plan`](PHASE1_REMEDIATION_PLAN_DETAILED.md)
4. [`Frontend package`](../../apps/web/package.json)
5. [`Localized App Router layout`](../../apps/web/src/app/[locale]/layout.tsx)
6. [`Locale routing`](../../apps/web/src/i18n/routing.ts)

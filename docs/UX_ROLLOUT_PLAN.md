# UX Rollout Plan — all pages, sequential, none missed

House standard per AGENTS.md §31.6. Every page gets, as applicable:

- **N1** No raw UUID inputs — EntityPicker or click-to-select everywhere.
- **N2** No UUIDs shown — names/labels only; IDs background state.
- **N3** Auto-load on mount for every list tab (no manual Load as the only path).
- **N4** Contextual buttons (Create vs Save), archive-with-confirm, hidden until loaded.
- **N5** Persistent loaded-entity headers.
- **N6** Dense forms (10+ fields) → horizontal pill sub-tabs.
- **N7** en/ar parity for every new key; tsc 0, vitest green, build 0 per batch.
- **N8** Unified Master-Detail View (Global Architecture): Viewing tabs (Details, Timeline, Assignments, etc.) are removed from top navigation and instead render sequentially beneath the selected entity in the main List tab. Action tabs (Create/Update, Link, Breakglass) remain separate.

> [!NOTE]
> **RESUME INSTRUCTION**: If resuming work on this plan, look for `[TAG: CONTINUE_UNIFIED_UX_LIKE_CASES]`. This tag indicates that the agent should apply rule **N8** to the next page in the queue, starting with the **Hearings** page (followed by Clients, Parties, etc. to retroactively apply N8 to previously completed N1-N7 pages).

## Status

- [x] 0. Organization (all 6 tabs) — DONE (reference implementation)
- [x] Dashboard restyle — DONE
- [x] EntityPicker component + batch 1/2 ID fields — DONE
- [x] Legal-config parents, compliance holds, transfer jobs/export, webhooks — DONE

## Queue (in order)

1. [x] Clients — tabs: list, client, contact, address (shared selection, contact/address lists added backend-side)
2. [x] Parties — tabs: list, party, relationship (shared selection, relationship pickers)
3. [x] Conflict-checks — tabs: list, check (shared selection, status-driven actions)
4. [x] Cases — tabs: list, case, parties, details, timeline, assignments, breakglass (shared selection; membership IDs stay manual, no lookup endpoint)
5. [x] Hearings — tabs: list, schedule, outcome
6. [ ] Deadlines — tabs: list, schedule, rules
7. [ ] Tasks — tabs: list, create
8. [ ] Documents + Secure-links — tabs: list, create, generate
9. [ ] Workflows — tabs: list, workflow, version
10. [ ] Legal-config remainder — auto-load + contextual buttons on all 4 tabs
11. [ ] Billing — tabs: fee, expense, invoice, lifecycle, payment, credit, ledger, balance, tax
12. [ ] Communications — tabs: threads, compose, inbox, delivery, attachments, consent
13. [ ] Calendar — tabs: connections, sync, mappings, conflicts, agenda
14. [ ] Portal — tabs: cases, documents, agenda, messages, invoices (read-only verify)
15. [ ] Transfer import tab — verify (jobs/export done)
16. [ ] Notifications — tabs: inbox, preferences, rules
17. [ ] Reports — tabs: definitions, run, schedules
18. [ ] AI — tabs: request, review
19. [ ] Compliance remainder — audit, retention tabs
20. [ ] Integrations remainder — connections, catalog tabs
21. [ ] Operations — tabs: status, policy, drills
22. [ ] Identity — bootstrap, invitations create/accept, members, roles, tenant-switch, users
23. [ ] Chrome — auth/login, admin/login, overview, settings (verify only)

Each item ships as its own commit+push after gates. Owner says go per item
(or "go all" for sequential run).

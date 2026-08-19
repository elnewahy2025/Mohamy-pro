# Project Reference

Source of truth:
- `Plan.txt`
- `ENGINEERING_BACKLOG.md`
- `Docs/Phase-0/STACK.md`

Project goal:
- Build a configurable, multi-tenant legal practice management platform that is secure by default, production-oriented, and provider-agnostic.

Canonical domain term:
- `Case` is the canonical legal record.
- `Matter` may be used as a display alias only if needed.

Core non-negotiables:
- Tenant isolation is enforced server-side.
- Authorization is backend-authoritative.
- AI is optional and cannot bypass authorization.
- External services are always accessed through adapters.
- No public URLs for legal documents.

Implementation stack:
- Defined in `Docs/Phase-0/STACK.md`

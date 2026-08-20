# Project Reference

Source of truth:
- `Plan.txt`
- `ENGINEERING_BACKLOG.md`
- `docs/phase0/STACK.md`

Project goal:
- Build a configurable, multi-tenant legal practice management platform that is secure by default, production-oriented, provider-agnostic, and fully bilingual in English and Arabic with RTL/LTR support.

Canonical domain term:
- `Case` is the canonical legal record.
- `Matter` may be used as a display alias only if needed.

Core non-negotiables:
- Tenant isolation is enforced server-side.
- Authorization is backend-authoritative.
- AI is optional and cannot bypass authorization.
- External services are always accessed through adapters.
- No public URLs for legal documents.
- The product must support English and Arabic with full RTL/LTR behavior across the UI, forms, and messages.

Implementation stack:
- Defined in `docs/phase0/STACK.md`

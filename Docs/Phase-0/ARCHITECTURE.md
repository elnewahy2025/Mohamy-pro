# Architecture

Style:
- Modular monolith initially.
- API-first.
- Strict module boundaries.
- DDD-oriented layering.

Implementation stack:
- Defined in `Docs/Phase-0/STACK.md`

Layering:
- Presentation
- API
- Application
- Domain
- Infrastructure

Architecture rules:
- Domain modules do not import provider SDKs.
- Controllers do not access the database directly.
- Frontend contains no business logic.
- Cross-module communication uses domain events or application services.
- The frontend must support English and Arabic with full RTL/LTR behavior and no hardcoded UI language.

Evolution:
- The architecture must allow later extraction of modules into services without rewriting the core domain.

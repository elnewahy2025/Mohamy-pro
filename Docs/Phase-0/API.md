# API

Base version:
- `/api/v1`

API rules:
- OpenAPI required.
- Consistent response envelope.
- Consistent error model.
- Pagination, filtering, sorting, and search supported where applicable.
- Idempotency required for applicable write operations.
- Request IDs and correlation IDs required.
- No stack traces or infrastructure internals exposed to users.

Compatibility:
- v1 contracts must not break silently.
- Deprecation and sunset policies must be explicit.


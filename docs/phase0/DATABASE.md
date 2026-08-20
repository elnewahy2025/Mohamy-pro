# Database

Primary database:
- PostgreSQL

Supporting stores:
- Redis for cache, sessions, rate limiting, and temporary state.
- Object storage for documents.
- Search index for full-text and metadata search.
- Queue for background jobs.

Database rules:
- Use migrations for every schema change.
- Use foreign keys, unique constraints, check constraints, and indexes.
- Prefer explicit lifecycle states over blanket soft delete.
- Use fixed precision decimal or integer minor units for money.
- Use tenant-aware constraints and row-level enforcement where appropriate.

Baseline columns:
- `id`
- `tenant_id` where applicable
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `status`


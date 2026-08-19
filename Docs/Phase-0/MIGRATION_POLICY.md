# Migration Policy

Rules:
- Every schema change requires a migration.
- No destructive migration without approval.
- Prefer expand/contract migration strategy.
- Backward-compatible migrations are preferred.
- Production migrations require backup and rollback or mitigation plans.
- Long-running migrations must be detected and reviewed.


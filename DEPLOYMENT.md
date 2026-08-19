# Deployment

Deployment model:
- Modular monolith initially.
- Staging must mirror production constraints as closely as practical.

Requirements:
- Environment separation
- Secrets management
- Health checks
- Rollback or mitigation plan
- Backup and restore validation
- Release notes

Production safety:
- No untested security-sensitive changes.
- No schema changes without migrations.


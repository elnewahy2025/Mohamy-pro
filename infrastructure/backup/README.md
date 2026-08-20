# PostgreSQL Backup Baseline

The Phase 1 backup baseline produces a timestamped SQL dump from the Mohamy PostgreSQL Compose service and provides a disposable restore smoke test. The scripts operate only on the Mohamy Compose project selected by `infrastructure/docker/docker-compose.yml`; they do not stop, remove, or recreate unrelated containers.

## Manual backup

Run from the repository root in PowerShell:

```powershell
& .\infrastructure\backup\backup.ps1
```

Backups are written to `infrastructure/backup/artifacts/`. That directory is intentionally excluded from version control and should be copied to protected storage with an organization-approved retention policy.

## Restore smoke test

Run the smoke test against a backup file:

```powershell
& .\infrastructure\backup\restore-smoke.ps1 -BackupFile .\infrastructure\backup\artifacts\mohamy_pro-YYYYMMDD-HHMMSS.sql
```

The smoke test creates a temporary database, imports the backup with `ON_ERROR_STOP`, verifies the Phase 1 `Health` table exists, and drops only the temporary database in a `finally` block. It does not reset or modify the primary `mohamy_pro` database.

## Windows Task Scheduler

Create a daily task that runs PowerShell with the following arguments, using an account permitted to access Docker Desktop:

```text
-NoProfile -ExecutionPolicy Bypass -File C:\path\to\Mohamy-pro\infrastructure\backup\backup.ps1
```

The task should run after Docker Desktop is available, write to a local protected directory, and be followed by an organization-approved off-machine copy and retention process. Phase 1 does not claim encryption or off-machine retention; those controls must be supplied by the deployment environment before production use.

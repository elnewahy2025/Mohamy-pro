# Windows Restart Script

The repository includes [`infrastructure/docker/start-mohamy-windows.ps1`](../../infrastructure/docker/start-mohamy-windows.ps1) for restarting the Mohamy development and verification environment after a Windows reboot.

## Standard startup

Start Docker Desktop manually and wait until the Docker engine is ready. Then open one PowerShell terminal and run:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\infrastructure\docker\start-mohamy-windows.ps1
```

The script starts only the existing Mohamy security containers—`mohamy-minkms`, `mohamy-aistor-security`, and `mohamy-clamav-security`—when they are stopped. It then starts only the Compose services `postgres`, `redis`, and `minio`, waits for PostgreSQL, Redis, and primary MinIO readiness, and opens separate PowerShell windows for the production API and worker processes.

The script does not stop, remove, recreate, or reset containers. It does not run the storage-security bootstrap, delete Docker volumes, modify migration history, or touch Health-ERP or Vision-ERP. It does not read, print, copy, or commit the AIStor license or protected environment file.

## Optional synchronization and build

Use `-Sync` only when the working tree is clean and synchronization is intentional:

```powershell
Set-Location 'C:\Users\ahmed\Documents\GitHub\Mohamy-pro'
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\infrastructure\docker\start-mohamy-windows.ps1 -Sync
```

The `-Sync` path first runs `git status --short`. If any local changes exist, it stops without pulling. When clean, it runs `git pull --ff-only origin main`, `pnpm install --frozen-lockfile`, Prisma Client generation, Prisma migration deployment, and the API build. It never resets, restores, stashes, deletes, or overwrites local work.

To synchronize without rebuilding the API, use:

```powershell
.\infrastructure\docker\start-mohamy-windows.ps1 -Sync -SkipBuild
```

The standard startup path is recommended for the current Windows workstation because the known local Compose healthcheck edit and preserved untracked files must remain untouched.

## After startup

The script opens two application terminals. The API terminal runs `pnpm --filter api start:prod`, and the worker terminal runs `pnpm --filter api start:worker`. Keep both terminals open while using the platform. The worker must be stopped first and the API second, each with one Ctrl+C, when a graceful shutdown is required.

The script does not run the outbox advanced-recovery runner, storage-security runner, e2e suite, or other destructive or data-mutating verification. Those remain explicit evidence commands and must not be added to an automatic workstation startup path.

## Failure behavior

The script fails closed when Docker Desktop is unavailable, the Compose file is missing, a required existing security container is missing, a required dependency does not become ready, or synchronization detects local changes. A missing security container is not recreated automatically; the existing isolated stack must be inspected and repaired explicitly rather than silently bootstrapped.

## References

1. [`Phase 1 final closure review`](FINAL_CLOSURE_REVIEW.md)
2. [`Windows-Docker closure boundary`](WINDOWS_DOCKER_CLOSURE_BOUNDARY.md)
3. [`Phase 2 entry decision`](../phase2/PHASE2_ENTRY_DECISION.md)
4. [`Engineering governance skill`](../../skills/engineering-governance/SKILL.md)

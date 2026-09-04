-- Phase 10-15 permission seal (additive, idempotent).
--
-- The Phase 10-15 controllers authorize against permission keys that were
-- never seeded into the global Permission catalog. This backfills the six
-- keys (matching the Phase 8/9 catalog-seed pattern) and grants them to the
-- built-in global Platform Admin role. Tenant-scoped tenant.admin roles are
-- granted at application startup by PermissionsService.reconcileBuiltInRoles
-- (wired via onApplicationBootstrap), which is driven by ROLE_PERMISSIONS and
-- already lists all six keys.

-- Permission catalog seed (idempotent; catalog is global and RLS-free).
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  catalog.key,
  catalog.description,
  now()
FROM (
  VALUES
    ('CanViewCaseTimeline', 'Read-only access to the append-only timeline projection of events for a case.'),
    ('CanManageWorkflows',  'Manage workflows, versions, and states within the active tenant.'),
    ('CanManageHearings',   'Manage case hearings and internal calendar events.'),
    ('CanManageDeadlines',  'Manage legal deadlines and reminder rules.'),
    ('CanManageTasks',      'Manage workflows and individual assignments for tasks.'),
    ('CanManageDocuments',  'Upload, version, share, and archive documents.')
) AS catalog(key, description)
ON CONFLICT ("key") DO NOTHING;

-- Grant the Phase 10-15 permissions to the built-in global Platform Admin role.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT
  r.id,
  p.id
FROM "Role" AS r
JOIN "Permission" AS p
  ON p.key IN (
    'CanViewCaseTimeline',
    'CanManageWorkflows',
    'CanManageHearings',
    'CanManageDeadlines',
    'CanManageTasks',
    'CanManageDocuments'
  )
WHERE r."key" = 'platform.admin'
  AND r."scope" = 'GLOBAL'
  AND r."tenantId" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

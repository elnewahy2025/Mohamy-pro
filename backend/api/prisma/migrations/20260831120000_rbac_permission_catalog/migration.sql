-- Grant permissions (see "RbacPermissionCatalog" management command).

-- Adds the audit event types used by the membership/invitation slice and
-- seeds the application permission catalog. The Permission table is not
-- RLS-enforced: it is a global, environment-independent catalog. Production
-- environments with Postgres 13+ provide gen_random_uuid() natively.

-- Permission catalog seed (idempotent; catalog is global and RLS-free).
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  catalog.key,
  catalog.description,
  now()
FROM (
  VALUES
    ('CanCreateTenant',     'Create a new tenant (Platform Admin).'),
    ('CanGrantPlatformAdmin', 'Grant or revoke Platform Admin assignment (Platform Admin).'),
    ('CanManageMembership', 'Administer memberships within the active tenant.'),
    ('CanInviteMembers',    'Create and manage invitations within the active tenant.'),
    ('CanViewTenant',       'View tenant-scoped data within the active tenant.'),
    ('CanManageRoles',      'Manage roles and role assignments within the active tenant.')
) AS catalog(key, description)
ON CONFLICT ("key") DO NOTHING;

-- Wire the built-in global Platform Admin role to its global policies. The
-- RolePermission FORCE-RLS policy permits global-role rows without tenant
-- context, so this backfill is safe in the migration transaction. Tenant-scoped
-- roles (tenant.admin) are wired by the application reconciliation service,
-- which runs inside the correct per-tenant context.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT
  r.id,
  p.id
FROM "Role" AS r
JOIN "Permission" AS p
  ON p.key IN ('CanCreateTenant', 'CanGrantPlatformAdmin', 'CanViewTenant')
WHERE r."key" = 'platform.admin'
  AND r."scope" = 'GLOBAL'
  AND r."tenantId" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;


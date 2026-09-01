-- W3: add the CanSwitchTenant named policy to the application permission
-- catalog. Unknown/unwired catalog keys are created at runtime by
-- PermissionsService.ensurePermissionId and wired by reconcileBuiltInRoles;
-- this seed makes the catalog row explicit and idempotent, matching the
-- existing rbac_permission_catalog migration. The Permission table is not
-- RLS-enforced: it is a global, environment-independent catalog.
--
-- The tenant.admin RolePermission wiring is done by the application
-- reconciliation service inside the correct per-tenant context, consistent
-- with the existing policy backfill.
INSERT INTO "Permission" (id, key, description, "createdAt")
SELECT
  gen_random_uuid()::text,
  'CanSwitchTenant',
  'Switch the active session tenant to a tenant the user has an ACTIVE membership in.',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "key" = 'CanSwitchTenant'
);
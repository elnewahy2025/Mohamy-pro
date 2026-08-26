-- Phase 2 authorization runtime boundary: grant only the read access required
-- for server-side policy evaluation. The migration remains valid before the
-- separately provisioned restricted role exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'mohamy_app'
  ) THEN
    GRANT SELECT ON TABLE
      public."GlobalRoleAssignment",
      public."Role",
      public."RolePermission",
      public."Permission",
      public."MembershipRole",
      public."AccessDenial"
      TO mohamy_app;
  END IF;
END
$$;

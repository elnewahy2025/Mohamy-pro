\set ON_ERROR_STOP on

-- User-run only. Execute this file as the existing administrative migration role.
-- This file contains no password and must never be executed by an application role.
-- It does not change ownership, drop data, alter RLS policies, or grant blanket
-- privileges to future objects.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'mohamy_app'
  ) THEN
    CREATE ROLE mohamy_app
      WITH LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM pg_class
      WHERE relowner = 'mohamy_app'::regrole
    ) OR EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE proowner = 'mohamy_app'::regrole
    ) OR EXISTS (
      SELECT 1
      FROM pg_namespace
      WHERE nspowner = 'mohamy_app'::regrole
    ) THEN
      RAISE EXCEPTION
        'mohamy_app owns database objects; ownership transfer is required outside this script';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_auth_members
      WHERE member = 'mohamy_app'::regrole
    ) THEN
      RAISE EXCEPTION
        'mohamy_app has role memberships; membership review is required outside this script';
    END IF;

    ALTER ROLE mohamy_app
      WITH LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'mohamy_app'
      AND (
        rolsuper
        OR rolbypassrls
        OR rolcreatedb
        OR rolcreaterole
        OR rolreplication
        OR NOT rolcanlogin
      )
  ) THEN
    RAISE EXCEPTION 'mohamy_app role attributes are not restricted';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM mohamy_app;
GRANT USAGE ON SCHEMA public TO mohamy_app;

DO $$
BEGIN
  IF has_schema_privilege('mohamy_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'mohamy_app retains CREATE privilege on the public schema';
  END IF;
END
$$;

-- These are the only tables currently used by the API/worker runtime path.
-- Future business tables require a separately reviewed grant.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM mohamy_app;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public."User",
  public."ExternalIdentity",
  public."AppSession",
  public."StorageObject",
  public."OutboxMessage"
  TO mohamy_app;
GRANT SELECT ON TABLE
  public."Membership",
  public."Tenant"
  TO mohamy_app;
GRANT SELECT, INSERT, DELETE ON TABLE public."AuditEvent" TO mohamy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."IdempotencyKey" TO mohamy_app;

-- The current Prisma schema uses UUID identifiers and has no sequence-backed
-- model fields. Explicitly remove any pre-existing sequence privilege.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM mohamy_app;

REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM mohamy_app;
REVOKE EXECUTE ON FUNCTION public.app_tenant_context_is_valid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_membership_selection_context_is_valid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_outbox_dispatch_context_is_valid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_global_operation_context_is_valid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_idempotency_maintenance_context_is_valid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_tenant_context_is_valid() TO mohamy_app;
GRANT EXECUTE ON FUNCTION public.app_membership_selection_context_is_valid() TO mohamy_app;
GRANT EXECUTE ON FUNCTION public.app_outbox_dispatch_context_is_valid() TO mohamy_app;
GRANT EXECUTE ON FUNCTION public.app_global_operation_context_is_valid() TO mohamy_app;
GRANT EXECUTE ON FUNCTION public.app_idempotency_maintenance_context_is_valid() TO mohamy_app;

-- No blanket ALTER DEFAULT PRIVILEGES is used. Future migrations must add an
-- explicit, reviewed grant for each new runtime table or helper function.

COMMIT;

-- Set the password interactively in the administrative psql session only:
-- \password mohamy_app

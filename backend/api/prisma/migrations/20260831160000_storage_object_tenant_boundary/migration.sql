-- Phase 2 legacy-table boundary: StorageObject tenant isolation.
--
-- StorageObject is strictly tenant-owned (NO global/global-NULL rows). This
-- migration enforces the tenant boundary so that a request or worker can only
-- read/modify storage metadata for the tenant it is authorized to act on.
--
-- Scope model:
--   * app_tenant_context_is_valid()        full request boundary (tenant +
--                                          user + membership + operation).
--   * app_worker_tenant_context_is_valid() worker/server boundary (tenant +
--                                          operation only; no membership).
--
-- Both contexts are accepted because storage metadata is written by the worker
-- path (malware scan updates, presigned URL generation) and may be read by
-- user-bound request paths (downloads). There is NO global/delivery scope:
-- StorageObject is never global.

-- Promote tenantId to NOT NULL (fail-closed: any existing NULL row would fail
-- the ALTER, which is the correct behavior for a table with no production
-- writers).
ALTER TABLE "StorageObject" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "StorageObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorageObject" FORCE ROW LEVEL SECURITY;

CREATE POLICY "StorageObject_tenant_isolation"
  ON "StorageObject"
  USING (
    (
      public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
    OR (
      public.app_worker_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    (
      public.app_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
    OR (
      public.app_worker_tenant_context_is_valid()
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  );

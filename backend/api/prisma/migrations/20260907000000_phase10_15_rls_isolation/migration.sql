-- Phase 10-15 RLS isolation (additive).
--
-- The Phase 10-15 tenant-owned tables were created without ROW LEVEL SECURITY.
-- This migration is additive (never touches already-applied migrations) and:
--   1. adds a NOT NULL tenantId column to the 7 leaf/child tables that lacked
--      one (defaulting is unnecessary because the migration chain has never
--      been applied, so those tables are empty at this point in the chain);
--   2. FORCE-enables row level security and installs a tenant-isolation policy
--      on all 16 Phase 10-15 tables, matching the Phase 2/4/5/6/8/9 pattern
--      implemented via the public.app_tenant_context_is_valid() helper.
--
-- RUNTIME SAFETY: every Phase 10-15 service create/read runs inside the
-- PrismaService.withTenantContext(...) helper (which sets app.tenant_id,
-- app.user_id, app.membership_id and app.operation_id before executing), and
-- the application write paths set "tenantId" on every inserted row -- including
-- the nested DocumentVersion / DocumentShare rows created by the document
-- service. This keeps FORCE RLS satisfied for both USING and WITH CHECK.

-- ---------------------------------------------------------------------------
-- Step 1: add tenantId to the child tables that lacked it.
-- ---------------------------------------------------------------------------

-- TaskChecklist
ALTER TABLE "TaskChecklist" ADD COLUMN "tenantId" TEXT NOT NULL;
ALTER TABLE "TaskChecklist" ADD CONSTRAINT "TaskChecklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TaskChecklist_tenantId_idx" ON "TaskChecklist"("tenantId");

-- TaskDependency
ALTER TABLE "TaskDependency" ADD COLUMN "tenantId" TEXT NOT NULL;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TaskDependency_tenantId_idx" ON "TaskDependency"("tenantId");

-- DocumentVersion
ALTER TABLE "DocumentVersion" ADD COLUMN "tenantId" TEXT NOT NULL;
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentVersion_tenantId_idx" ON "DocumentVersion"("tenantId");

-- DocumentTag
ALTER TABLE "DocumentTag" ADD COLUMN "tenantId" TEXT NOT NULL;
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentTag_tenantId_idx" ON "DocumentTag"("tenantId");

-- DocumentMetadata
ALTER TABLE "DocumentMetadata" ADD COLUMN "tenantId" TEXT NOT NULL;
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentMetadata_tenantId_idx" ON "DocumentMetadata"("tenantId");

-- DocumentShare
ALTER TABLE "DocumentShare" ADD COLUMN "tenantId" TEXT NOT NULL;
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentShare_tenantId_idx" ON "DocumentShare"("tenantId");

-- DocumentAccess
ALTER TABLE "DocumentAccess" ADD COLUMN "tenantId" TEXT NOT NULL;
ALTER TABLE "DocumentAccess" ADD CONSTRAINT "DocumentAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentAccess_tenantId_idx" ON "DocumentAccess"("tenantId");

-- ---------------------------------------------------------------------------
-- Step 2: FORCE RLS + tenant-isolation policy on all 16 Phase 10-15 tables.
-- ---------------------------------------------------------------------------

-- Workflow Engine (Phase 11)
ALTER TABLE "Workflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workflow" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Workflow_tenant_isolation"
  ON "Workflow"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "WorkflowVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "WorkflowVersion_tenant_isolation"
  ON "WorkflowVersion"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "WorkflowState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowState" FORCE ROW LEVEL SECURITY;
CREATE POLICY "WorkflowState_tenant_isolation"
  ON "WorkflowState"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "WorkflowTransition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowTransition" FORCE ROW LEVEL SECURITY;
CREATE POLICY "WorkflowTransition_tenant_isolation"
  ON "WorkflowTransition"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Hearing Management (Phase 12)
ALTER TABLE "Hearing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Hearing" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Hearing_tenant_isolation"
  ON "Hearing"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Legal Deadline Engine (Phase 13)
ALTER TABLE "DeadlineRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeadlineRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DeadlineRule_tenant_isolation"
  ON "DeadlineRule"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "Deadline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deadline" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Deadline_tenant_isolation"
  ON "Deadline"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Task Management (Phase 14)
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Task_tenant_isolation"
  ON "Task"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TaskChecklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskChecklist" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TaskChecklist_tenant_isolation"
  ON "TaskChecklist"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TaskDependency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskDependency" FORCE ROW LEVEL SECURITY;
CREATE POLICY "TaskDependency_tenant_isolation"
  ON "TaskDependency"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

-- Document Management (Phase 15)
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Document_tenant_isolation"
  ON "Document"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentVersion_tenant_isolation"
  ON "DocumentVersion"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentTag_tenant_isolation"
  ON "DocumentTag"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentMetadata" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentMetadata" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentMetadata_tenant_isolation"
  ON "DocumentMetadata"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentShare" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentShare_tenant_isolation"
  ON "DocumentShare"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "DocumentAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentAccess" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DocumentAccess_tenant_isolation"
  ON "DocumentAccess"
  USING (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.app_tenant_context_is_valid()
    AND "tenantId" = current_setting('app.tenant_id', true)
  );

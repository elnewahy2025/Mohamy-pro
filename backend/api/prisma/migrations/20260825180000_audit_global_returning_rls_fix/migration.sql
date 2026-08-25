-- Phase 2: allow the global authentication audit INSERT ... RETURNING path.
-- Additive policy correction only: no data, ownership, grants, or migration history
-- is reset or rewritten.

DROP POLICY IF EXISTS "AuditEvent_global_control_select" ON "AuditEvent";
CREATE POLICY "AuditEvent_global_control_select"
  ON "AuditEvent"
  FOR SELECT
  USING (
    current_setting('app.audit_retention_purge', true) = 'true'
    OR current_setting('app.outbox_dispatcher', true) = 'true'
    OR (
      current_setting('app.global_operation', true) = 'true'
      AND "tenantId" IS NULL
    )
  );

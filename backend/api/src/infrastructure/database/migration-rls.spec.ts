import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
);

const PHASE10_15_TABLES = [
  'Workflow',
  'WorkflowVersion',
  'WorkflowState',
  'WorkflowTransition',
  'Hearing',
  'Deadline',
  'DeadlineRule',
  'Task',
  'TaskChecklist',
  'TaskDependency',
  'Document',
  'DocumentVersion',
  'DocumentTag',
  'DocumentMetadata',
  'DocumentShare',
  'DocumentAccess',
];

const CHILD_TABLES = [
  'TaskChecklist',
  'TaskDependency',
  'DocumentVersion',
  'DocumentTag',
  'DocumentMetadata',
  'DocumentShare',
  'DocumentAccess',
];

function readMigration(directory: string): string {
  return readFileSync(join(MIGRATIONS_DIR, directory, 'migration.sql'), 'utf8');
}

describe('Phase 10-15 migration assertions', () => {
  it('enables FORCE RLS with a tenant_isolation policy on all 16 tables', () => {
    const rlsMigration = readMigration(
      '20260907000000_phase10_15_rls_isolation',
    );

    for (const table of PHASE10_15_TABLES) {
      expect(rlsMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(rlsMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(rlsMigration).toContain(`"${table}_tenant_isolation"`);
    }
  });

  it('adds a NOT NULL tenantId column + FK to each child table', () => {
    const rlsMigration = readMigration(
      '20260907000000_phase10_15_rls_isolation',
    );

    for (const table of CHILD_TABLES) {
      expect(rlsMigration).toContain(
        `ALTER TABLE "${table}" ADD COLUMN "tenantId" TEXT NOT NULL`,
      );
      expect(rlsMigration).toContain(`"${table}_tenantId_fkey"`);
    }
  });

  it('seals the six Phase 10-15 permissions idempotently', () => {
    const sealMigration = readMigration(
      '20260907010000_phase10_15_permission_seal',
    );

    for (const key of [
      'CanViewCaseTimeline',
      'CanManageWorkflows',
      'CanManageHearings',
      'CanManageDeadlines',
      'CanManageTasks',
      'CanManageDocuments',
    ]) {
      expect(sealMigration).toContain(`'${key}'`);
    }
    expect(sealMigration).toContain('ON CONFLICT ("key") DO NOTHING');
    expect(sealMigration).toContain("'platform.admin'");
  });

  it('creates all 20 Phase 16-19 tables in the foundation migration', () => {
    const foundationMigration = readMigration(
      '20260908000000_phase16_19_foundation',
    );

    for (const table of [
      'DocumentSecurityMetadata',
      'DocumentScan',
      'SignedAccessGrant',
      'DocumentDownload',
      'OcrProcessing',
      'OcrPage',
      'OcrEntity',
      'ClassificationResult',
      'HumanReview',
      'ApprovedDocumentMetadata',
      'SearchIndexVersion',
      'SearchReindexJob',
      'Template',
      'TemplateVersion',
      'TemplateVariable',
      'TemplateApproval',
      'DocumentGenerationJob',
      'Rate',
      'TimeEntry',
      'Timer',
    ]) {
      expect(foundationMigration).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('enables FORCE RLS with a tenant_isolation policy on all 19 tenant tables', () => {
    const foundationMigration = readMigration(
      '20260908000000_phase16_19_foundation',
    );

    for (const table of [
      'DocumentSecurityMetadata',
      'DocumentScan',
      'SignedAccessGrant',
      'DocumentDownload',
      'OcrProcessing',
      'OcrPage',
      'OcrEntity',
      'ClassificationResult',
      'HumanReview',
      'ApprovedDocumentMetadata',
      'SearchReindexJob',
      'Template',
      'TemplateVersion',
      'TemplateVariable',
      'TemplateApproval',
      'DocumentGenerationJob',
      'Rate',
      'TimeEntry',
      'Timer',
    ]) {
      expect(foundationMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(foundationMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(foundationMigration).toContain(`"${table}_tenant_isolation"`);
    }

    expect(foundationMigration).toContain(
      '"SearchIndexVersion_tenant_context"',
    );
  });

  it('adds a tenantId FK on each Phase 16-19 child table', () => {
    const foundationMigration = readMigration(
      '20260908000000_phase16_19_foundation',
    );

    for (const table of [
      'OcrPage',
      'OcrEntity',
      'ClassificationResult',
      'HumanReview',
      'TemplateVariable',
    ]) {
      expect(foundationMigration).toContain(`"${table}_tenantId_fkey"`);
    }
  });

  it('creates all 10 Phase 21 billing tables with FORCE RLS', () => {
    const billingMigration = readMigration(
      '20260908000001_phase21_billing_foundation',
    );

    for (const table of [
      'Fee',
      'Expense',
      'Invoice',
      'InvoiceLine',
      'Payment',
      'Credit',
      'CreditApplication',
      'Refund',
      'LedgerEntry',
      'TaxRule',
    ]) {
      expect(billingMigration).toContain(`CREATE TABLE "${table}"`);
      expect(billingMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(billingMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(billingMigration).toContain(`"${table}_tenant_isolation"`);
    }
    expect(billingMigration).not.toContain('CREATE TYPE "CurrencyCode"');
  });

  it('creates all 4 Phase 22 communications tables with FORCE RLS', () => {
    const commsMigration = readMigration(
      '20260908000002_phase22_communications_foundation',
    );

    for (const table of [
      'MessageThread',
      'Message',
      'MessageAttachment',
      'MessageConsent',
    ]) {
      expect(commsMigration).toContain(`CREATE TABLE "${table}"`);
      expect(commsMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(commsMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(commsMigration).toContain(`"${table}_tenant_isolation"`);
    }
  });

  it('creates all 4 Phase 23 calendar tables with FORCE RLS', () => {
    const calendarMigration = readMigration(
      '20260908000003_phase23_calendar_foundation',
    );

    for (const table of [
      'CalendarConnection',
      'CalendarSyncCursor',
      'CalendarEventMapping',
      'CalendarSyncConflict',
    ]) {
      expect(calendarMigration).toContain(`CREATE TABLE "${table}"`);
      expect(calendarMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(calendarMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(calendarMigration).toContain(`"${table}_tenant_isolation"`);
    }
    expect(calendarMigration).not.toContain('refreshToken');
    expect(calendarMigration).not.toContain('accessToken');
  });

  it('creates DirectPermissionGrant with FORCE RLS (G2)', () => {
    const g2Migration = readMigration('20260908000004_g2_denial_direct_grants');

    expect(g2Migration).toContain('CREATE TABLE "DirectPermissionGrant"');
    expect(g2Migration).toContain(
      'ALTER TABLE "DirectPermissionGrant" ENABLE ROW LEVEL SECURITY',
    );
    expect(g2Migration).toContain(
      'ALTER TABLE "DirectPermissionGrant" FORCE ROW LEVEL SECURITY',
    );
    expect(g2Migration).toContain('"DirectPermissionGrant_tenant_isolation"');
  });

  it('creates CaseAssignment with FORCE RLS (G5)', () => {
    const g5Migration = readMigration('20260908000005_g5_case_assignment');

    expect(g5Migration).toContain('CREATE TABLE "CaseAssignment"');
    expect(g5Migration).toContain(
      'ALTER TABLE "CaseAssignment" ENABLE ROW LEVEL SECURITY',
    );
    expect(g5Migration).toContain(
      'ALTER TABLE "CaseAssignment" FORCE ROW LEVEL SECURITY',
    );
    expect(g5Migration).toContain('"CaseAssignment_tenant_isolation"');
  });

  it('creates BreakGlassActivation with FORCE RLS (G7)', () => {
    const g7Migration = readMigration('20260908000006_g7_breakglass');

    expect(g7Migration).toContain('CREATE TABLE "BreakGlassActivation"');
    expect(g7Migration).toContain(
      'ALTER TABLE "BreakGlassActivation" ENABLE ROW LEVEL SECURITY',
    );
    expect(g7Migration).toContain(
      'ALTER TABLE "BreakGlassActivation" FORCE ROW LEVEL SECURITY',
    );
    expect(g7Migration).toContain('"BreakGlassActivation_tenant_isolation"');
  });

  it('adds portal client linkage columns without new RLS surface (Phase 24)', () => {
    const portalMigration = readMigration(
      '20260908000007_phase24_portal_linkage',
    );

    expect(portalMigration).toContain(
      'ALTER TABLE "Membership" ADD COLUMN "clientId" TEXT',
    );
    expect(portalMigration).toContain(
      'ALTER TABLE "Invitation" ADD COLUMN "clientId" TEXT',
    );
    expect(portalMigration).not.toContain('CREATE TABLE');
  });

  it('creates all 3 Phase 25 transfer tables with FORCE RLS', () => {
    const transferMigration = readMigration(
      '20260908000008_phase25_transfer_foundation',
    );

    for (const table of ['ImportJob', 'ImportRowError', 'ExportJob']) {
      expect(transferMigration).toContain(`CREATE TABLE "${table}"`);
      expect(transferMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(transferMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(transferMigration).toContain(`"${table}_tenant_isolation"`);
    }
  });

  it('creates all 3 Phase 26 notification tables with FORCE RLS', () => {
    const notificationsMigration = readMigration(
      '20260908000009_phase26_notifications_foundation',
    );

    for (const table of [
      'NotificationRule',
      'Notification',
      'NotificationPreference',
    ]) {
      expect(notificationsMigration).toContain(`CREATE TABLE "${table}"`);
      expect(notificationsMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(notificationsMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(notificationsMigration).toContain(`"${table}_tenant_isolation"`);
    }
  });

  it('creates all 3 Phase 27 reporting tables with FORCE RLS', () => {
    const reportingMigration = readMigration(
      '20260908000010_phase27_reporting_foundation',
    );

    for (const table of [
      'ReportDefinition',
      'ReportSchedule',
      'ReportRun',
    ]) {
      expect(reportingMigration).toContain(`CREATE TABLE "${table}"`);
      expect(reportingMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(reportingMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(reportingMigration).toContain(`"${table}_tenant_isolation"`);
    }
  });

  it('creates the Phase 29 intake table with FORCE RLS', () => {
    const intakeMigration = readMigration(
      '20260908000011_phase29_intake_foundation',
    );

    expect(intakeMigration).toContain('CREATE TABLE "IntakeRequest"');
    expect(intakeMigration).toContain(
      'ALTER TABLE "IntakeRequest" ENABLE ROW LEVEL SECURITY',
    );
    expect(intakeMigration).toContain(
      'ALTER TABLE "IntakeRequest" FORCE ROW LEVEL SECURITY',
    );
    expect(intakeMigration).toContain('"IntakeRequest_tenant_isolation"');
  });

  it('creates both Phase 30 compliance tables with FORCE RLS', () => {
    const complianceMigration = readMigration(
      '20260908000012_phase30_compliance_foundation',
    );

    for (const table of ['RetentionPolicy', 'LegalHold']) {
      expect(complianceMigration).toContain(`CREATE TABLE "${table}"`);
      expect(complianceMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(complianceMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(complianceMigration).toContain(`"${table}_tenant_isolation"`);
    }
  });

  it('creates both Phase 31 integration tables with FORCE RLS', () => {
    const integrationsMigration = readMigration(
      '20260908000013_phase31_integrations_foundation',
    );

    for (const table of ['Integration', 'WebhookEndpoint']) {
      expect(integrationsMigration).toContain(`CREATE TABLE "${table}"`);
      expect(integrationsMigration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(integrationsMigration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(integrationsMigration).toContain(`"${table}_tenant_isolation"`);
    }
  });

  it('no longer re-creates duplicate or destructive statements in the workflow migration', () => {
    const workflowMigration = readMigration(
      '20260905100000_workflow_engine_foundation',
    );

    // Duplicate Country/Jurisdiction/Court/CourtLocation re-creates removed.
    expect(workflowMigration).not.toContain('CREATE TABLE "Country"');
    expect(workflowMigration).not.toContain('CREATE TABLE "CourtLocation"');
    // Duplicate CaseParty FK/index re-creates removed.
    expect(workflowMigration).not.toContain('CaseParty_partyId_fkey');
    // Destructive/missing drops removed.
    expect(workflowMigration).not.toContain('DROP TYPE "ConflictPartyKind"');
    expect(workflowMigration).not.toContain(
      'DROP INDEX "OutboxMessage_status_createdAt_idx"',
    );

    // Genuine workflow-engine content retained.
    expect(workflowMigration).toContain('CREATE TABLE "Workflow"');
    expect(workflowMigration).toContain('CREATE TABLE "WorkflowTransition"');
  });
});

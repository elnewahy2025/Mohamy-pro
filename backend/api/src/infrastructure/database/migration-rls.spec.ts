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

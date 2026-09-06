import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(__dirname, '..', '..');

const CONTROLLER_REL_PATHS: Record<string, string> = {
  'case-timeline': 'case-timeline/case-timeline.controller.ts',
  hearing: 'hearings/hearing.controller.ts',
  deadline: 'deadlines/deadline.controller.ts',
  task: 'tasks/task.controller.ts',
  document: 'documents/document.controller.ts',
  workflow: 'workflows/workflow.controller.ts',
};

describe('Phase 10-15 controller guard assertions', () => {
  for (const [name, relPath] of Object.entries(CONTROLLER_REL_PATHS)) {
    it(`uses SessionGuard + CsrfGuard on the ${name} controller`, () => {
      const source = readFileSync(join(SRC_DIR, relPath), 'utf8');
      expect(source).toContain('SessionGuard');
      expect(source).toContain('CsrfGuard');
      expect(source).toContain('@UseGuards(SessionGuard, CsrfGuard)');
    });
  }
});

const SCAFFOLD_CONTROLLER_REL_PATHS: Record<string, string> = {
  templates: 'templates/template.controller.ts',
  'template-generation': 'templates/template-generation.controller.ts',
  search: 'search/search.controller.ts',
  'admin-search': 'search/admin-search.controller.ts',
  ocr: 'documents/ocr/ocr.controller.ts',
  'document-security': 'documents/security/document-security.controller.ts',
  roles: 'roles/role.controller.ts',
  denials: 'denials/denial.controller.ts',
};

const FULL_SURFACE_CONTROLLER_REL_PATHS: string[] = [
  'auth/auth.controller.ts',
  'auth/session/tenant-switch.controller.ts',
  'billing/billing.controller.ts',
  'bootstrap/bootstrap.controller.ts',
  'breakglass/breakglass.controller.ts',
  'calendar/calendar.controller.ts',
  'case-timeline/case-timeline.controller.ts',
  'cases/case.controller.ts',
  'clients/address.controller.ts',
  'clients/client.controller.ts',
  'clients/contact.controller.ts',
  'communications/communications.controller.ts',
  'conflict-checks/conflict-check.controller.ts',
  'deadlines/deadline.controller.ts',
  'denials/denial.controller.ts',
  'documents/document.controller.ts',
  'documents/ocr/ocr.controller.ts',
  'documents/security/document-security.controller.ts',
  'hearings/hearing.controller.ts',
  'legal-config/legal-config.controller.ts',
  'membership/admin/membership-admin.controller.ts',
  'membership/invitation/invitation.controller.ts',
  'organization-config/hierarchy/branch.controller.ts',
  'organization-config/hierarchy/department.controller.ts',
  'organization-config/hierarchy/organization.controller.ts',
  'organization-config/hierarchy/team.controller.ts',
  'organization-config/settings/settings.controller.ts',
  'parties/party.controller.ts',
  'roles/role.controller.ts',
  'search/admin-search.controller.ts',
  'search/search.controller.ts',
  'tasks/task.controller.ts',
  'templates/template-generation.controller.ts',
  'templates/template.controller.ts',
  'time-tracking/rate.controller.ts',
  'time-tracking/time-entry.controller.ts',
  'time-tracking/timer.controller.ts',
  'workflows/workflow.controller.ts',
];

describe('G1 scaffold controller guard assertions', () => {
  for (const [name, relPath] of Object.entries(SCAFFOLD_CONTROLLER_REL_PATHS)) {
    it(`applies SessionGuard + CsrfGuard on the ${name} controller`, () => {
      const source = readFileSync(join(SRC_DIR, relPath), 'utf8');
      expect(source).toContain('SessionGuard');
      expect(source).toContain('CsrfGuard');
      expect(source).toContain('@UseGuards(SessionGuard, CsrfGuard)');
    });

    it(`derives tenant context from session auth in the ${name} controller`, () => {
      const source = readFileSync(join(SRC_DIR, relPath), 'utf8');
      expect(source).toContain('.auth');
      expect(source).not.toContain('req.tenantId');
      expect(source).not.toContain("req.user?.id || 'system'");
    });
  }
});

describe('G8 full-surface guard assertions', () => {
  it('applies SessionGuard on every controller except intentional exceptions', () => {
    for (const relPath of FULL_SURFACE_CONTROLLER_REL_PATHS) {
      const source = readFileSync(join(SRC_DIR, relPath), 'utf8');
      expect(source).toContain('@UseGuards(SessionGuard');
    }
  });

  it('leaves health public by design (liveness only)', () => {
    const source = readFileSync(
      join(SRC_DIR, 'health/health.controller.ts'),
      'utf8',
    );
    expect(source).not.toContain('@UseGuards');
    expect(source).toContain('live');
  });

  it('protects metrics by token instead of session guards', () => {
    const source = readFileSync(
      join(SRC_DIR, 'observability/metrics.controller.ts'),
      'utf8',
    );
    expect(source).not.toContain('@UseGuards');
    expect(source).toContain('isMetricsAuthorized');
  });
});

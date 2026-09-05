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

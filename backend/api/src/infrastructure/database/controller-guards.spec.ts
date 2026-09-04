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

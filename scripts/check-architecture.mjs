import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const violations = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist' || entry === 'coverage') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|jsx|mjs|json)$/.test(entry)) inspect(path);
  }
}

function inspect(path) {
  const content = readFileSync(path, 'utf8');
  const relativePath = relative(root, path).replaceAll('\\', '/');
  const obsoleteImport = /from ['"](?:react-router-dom|vite)['"]|@vitejs\/plugin-react|createRoot\(/.test(content);
  if (relativePath.startsWith('apps/web/') && obsoleteImport) {
    violations.push(`${relativePath}: obsolete Vite or React Router boundary detected`);
  }
  if (/^backend\/api\/src\/.*controller\.ts$/.test(relativePath) && /from ['"].*\/infrastructure\//.test(content)) {
    violations.push(`${relativePath}: direct infrastructure import from presentation boundary`);
  }
}

walk(join(root, 'apps'));
walk(join(root, 'backend'));

if (violations.length) {
  console.error('Architecture-fitness violations detected:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Architecture-fitness checks passed.');

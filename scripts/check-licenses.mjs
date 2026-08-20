import { execFileSync } from 'node:child_process';

const output = execFileSync('pnpm', ['licenses', 'list', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const report = JSON.parse(output);
const prohibited = Object.keys(report).filter((license) => /^(AGPL|GPL|SSPL|EPL-1)/i.test(license));

if (prohibited.length) {
  console.error(`Prohibited dependency licenses detected: ${prohibited.join(', ')}`);
  process.exit(1);
}

console.log(`License policy passed across ${Object.keys(report).length} license categories.`);

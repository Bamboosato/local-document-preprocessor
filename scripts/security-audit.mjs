import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { evaluateAudits, parseAuditProcess } from './security-audit-policy.mjs';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check with npm run audit:security.');
mkdirSync('.security-audit', { recursive: true });

function audit(name, args) {
  const result = spawnSync(process.execPath, [npmCli, 'audit', '--json',
    '--fetch-retries=0', '--fetch-timeout=30000', ...args], {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 90_000,
  });
  // Reports contain public package metadata, never document input or output.
  writeFileSync(`.security-audit/${name}.json`, result.stdout || '{}\n');
  return parseAuditProcess(result);
}

let failed = false;
const reports = {};
for (const [name, args] of [['production', ['--omit=dev']], ['full', []]]) {
  try { reports[name] = audit(name, args); }
  catch { console.error(`Security audit (${name}) unavailable or invalid.`); failed = true; }
}
if (!failed) {
  const result = evaluateAudits(reports);
  console.log('Production vulnerabilities:', reports.production.metadata.vulnerabilities);
  console.log('All dependency vulnerabilities:', reports.full.metadata.vulnerabilities);
  if (!result.ok) { console.error('Blocking findings:', result.blocked.join(', ')); failed = true; }
}
process.exitCode = failed ? 1 : 0;

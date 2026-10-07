const severities = ['info', 'low', 'moderate', 'high', 'critical'];

export function validateAudit(report) {
  if (!report || report.auditReportVersion !== 2 || Object.hasOwn(report, 'error') ||
      !report.vulnerabilities || typeof report.vulnerabilities !== 'object' ||
      Array.isArray(report.vulnerabilities) || !report.metadata?.vulnerabilities) return false;
  const totals = report.metadata.vulnerabilities;
  const counts = Object.fromEntries(severities.map((severity) => [severity, 0]));
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    if (!item || item.name !== name || !severities.includes(item.severity) ||
        !Array.isArray(item.via) || !item.via.length ||
        !Array.isArray(item.nodes) || !item.nodes.length ||
        !item.nodes.every((node) => typeof node === 'string' && node.length > 0)) return false;
    counts[item.severity] += 1;
  }
  return severities.every((severity) => Number.isSafeInteger(totals[severity]) &&
    totals[severity] === counts[severity]) && Number.isSafeInteger(totals.total) &&
    totals.total === Object.keys(report.vulnerabilities).length;
}

export function evaluateAudits({ production, full }) {
  if (!validateAudit(production) || !validateAudit(full)) {
    return { ok: false, blocked: ['Invalid or unavailable npm audit response'] };
  }
  const blocked = [
    ...Object.keys(production.vulnerabilities).map((name) => `production: ${name}`),
    ...Object.keys(full.vulnerabilities).map((name) => `full: ${name}`),
  ];
  return { ok: blocked.length === 0, blocked };
}

export function parseAuditProcess(result) {
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error('npm audit did not complete successfully.');
  }
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw new Error('Invalid audit JSON.'); }
  if (!validateAudit(report) || (result.status === 0) !== (report.metadata.vulnerabilities.total === 0)) {
    throw new Error('Invalid or inconsistent audit response.');
  }
  return report;
}

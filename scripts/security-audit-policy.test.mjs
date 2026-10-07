import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAudits, parseAuditProcess } from './security-audit-policy.mjs';

function report(severity) {
  return { auditReportVersion: 2,
    vulnerabilities: severity ? { example: { name: 'example', severity,
      via: ['dependency'], nodes: ['node_modules/example'] } } : {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0,
      ...(severity ? { [severity]: 1 } : {}), total: severity ? 1 : 0 } } };
}

test('[正常系] 本番・全依存の有効なゼロ件だけを成功とする', () => {
  assert.equal(evaluateAudits({ production: report(), full: report() }).ok, true);
});
for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
  test(`[境界値] 本番または開発依存の${severity}一件でもブロックする`, () => {
    assert.equal(evaluateAudits({ production: report(severity), full: report(severity) }).ok, false);
    assert.equal(evaluateAudits({ production: report(), full: report(severity) }).ok, false);
  });
}
test('[異常系] 欠落・error・件数不一致・未知深刻度を成功にしない', () => {
  const inconsistent = report(); inconsistent.metadata.vulnerabilities.total = 1;
  const unknown = report('unknown');
  for (const full of [null, {}, { ...report(), error: {} }, inconsistent, unknown,
    { ...report(), auditReportVersion: 1 }, { ...report(), vulnerabilities: [] }]) {
    assert.equal(evaluateAudits({ production: report(), full }).ok, false);
  }
});
test('[異常系] ネットワーク失敗・timeout・非JSON・終了コード不一致を拒否する', () => {
  for (const result of [
    { status: 0, stdout: JSON.stringify(report()), error: new Error('timeout') },
    { status: null, stdout: '' }, { status: 2, stdout: '{}' },
    { status: 0, stdout: '<html>' }, { status: 0, stdout: '{}' },
    { status: 1, stdout: JSON.stringify(report()) },
    { status: 0, stdout: JSON.stringify(report('low')) },
  ]) assert.throws(() => parseAuditProcess(result));
  assert.deepEqual(parseAuditProcess({ status: 1, stdout: JSON.stringify(report('low')) }), report('low'));
});
test('[状態遷移] 同じ構成でも新しい勧告の出現で成功から失敗へ変わる', () => {
  assert.equal(evaluateAudits({ production: report(), full: report() }).ok, true);
  assert.equal(evaluateAudits({ production: report(), full: report('high') }).ok, false);
});

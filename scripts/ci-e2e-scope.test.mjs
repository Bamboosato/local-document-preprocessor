import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectE2eScope } from './ci-e2e-scope.mjs';

test('[正常系] 文書のみはE2E未実施、PWAとUIは対象ケースを選ぶ', () => {
  assert.equal(selectE2eScope(['README.md', 'docs/requirements.md']).scope, 'none');
  assert.match(selectE2eScope(['public/sw.js']).grep, /PWA/);
  assert.match(selectE2eScope(['src/styles.css']).grep, /狭幅/);
});
test('[境界値] 文書混在でも依存更新・共通コード・未知ファイルを全件確認する', () => {
  for (const file of ['package-lock.json', 'src/converter/converter.worker.ts', '.github/workflows/ci.yml', 'unknown']) {
    assert.equal(selectE2eScope(['README.md', file]).scope, 'full');
  }
  assert.equal(selectE2eScope(['public/sw.js', 'src/quality/assessConversion.ts']).scope, 'targeted');
});
test('[状態遷移] 手動全件指定は文書のみの未実施選択を上書きする', () => {
  assert.equal(selectE2eScope(['README.md'], true).scope, 'full');
});

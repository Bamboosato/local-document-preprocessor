import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function selectE2eScope(files, forceFull = false) {
  if (forceFull) return { scope: 'full', grep: '', reason: 'Manual full verification' };
  if (!files.length || files.every((file) => /\.md$/i.test(file))) {
    return { scope: 'none', grep: '', reason: 'Documentation-only change' };
  }
  const patterns = new Set();
  for (const file of files) {
    if (/\.md$/i.test(file)) continue;
    if (/^(public\/|index\.html$|src\/main\.tsx$)/.test(file)) {
      patterns.add('PWA|実 WASM');
    } else if (/^src\/(styles\.css|components\/MarkdownPreview(?:\.test)?\.tsx)$/.test(file)) {
      patterns.add('wide-table|狭幅|初期表示|実 WASM');
    } else if (/^src\/components\/(SelectionDialog|ResultCard)(?:\.test)?\.tsx$/.test(file)) {
      patterns.add('page-break|選択シート|狭幅|画像のみ|Type0');
    } else if (/^src\/quality\//.test(file)) {
      patterns.add('PDF|実 WASM');
    } else {
      return { scope: 'full', grep: '', reason: 'Shared implementation, dependencies, CI or unclassified change' };
    }
  }
  return { scope: 'targeted', grep: [...patterns].join('|'), reason: 'Cases selected from affected features' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let selected;
  if (process.env.GITHUB_EVENT_NAME === 'schedule') {
    selected = { scope: 'none', grep: '', reason: 'Weekly dependency audit only' };
  } else if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    selected = selectE2eScope([], process.env.CI_E2E_FULL === 'true');
    if (selected.scope === 'none') selected = {
      scope: 'targeted', grep: 'PWA|実 WASM|PDF|page-break|選択シート',
      reason: 'Manual critical conversion and privacy cases',
    };
  } else {
    const base = event.pull_request?.base.sha ?? event.before;
    const head = event.pull_request?.head.sha ?? event.after;
    if (![base, head].every((sha) => typeof sha === 'string' && /^[a-f\d]{40}$/i.test(sha) && !/^0+$/.test(sha))) {
      selected = selectE2eScope(['unavailable-change-range']);
    } else {
      const range = event.pull_request ? `${base}...${head}` : `${base}..${head}`;
      const files = execFileSync('git', ['diff', '--name-only', '-z', range], { encoding: 'utf8' }).split('\0').filter(Boolean);
      selected = selectE2eScope(files);
    }
  }
  for (const [key, value] of Object.entries(selected)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`E2E scope: ${selected.scope}; ${selected.reason}`);
}

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = ['README.md', 'AGENTS.md', ...readdirSync('docs', { recursive: true })
  .filter((file) => file.endsWith('.md')).map((file) => `docs/${file}`)];
const issues = [];
let links = 0;
for (const file of files) {
  const body = readFileSync(file, 'utf8');
  if ((body.match(/^```/gm) ?? []).length % 2) issues.push(`${file}: unmatched code fence`);
  // Ignore example links inside fenced code, which are not document navigation.
  const prose = body.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of prose.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(https?:|mailto:)/.test(href)) continue;
    const [relative, anchor] = href.split('#');
    const target = relative ? resolve(dirname(file), relative) : resolve(file);
    links += 1;
    if (!existsSync(target)) { issues.push(`${file}: missing local link`); continue; }
    if (anchor && target.endsWith('.md')) {
      const headings = [...readFileSync(target, 'utf8').matchAll(/^#+\s+(.+)$/gm)]
        .map((heading) => heading[1].trim().toLowerCase()
          .replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-'));
      if (!headings.includes(decodeURIComponent(anchor))) issues.push(`${file}: missing heading anchor`);
    }
  }
}
for (const issue of issues) console.error(issue);
console.log(`Document checks: ${files.length} documents, ${links} local links, ${issues.length} issues.`);
process.exitCode = issues.length ? 1 : 0;

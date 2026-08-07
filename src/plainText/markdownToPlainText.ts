import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  children?: MarkdownNode[];
}

function inlineText(node: MarkdownNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value ?? '';
    case 'break':
      return '\n';
    case 'image':
      return node.alt ? `[画像: ${node.alt}]` : '[画像]';
    case 'link': {
      const label = (node.children ?? []).map(inlineText).join('');
      if (!node.url || label === node.url) {
        return label || node.url || '';
      }
      return `${label} (${node.url})`;
    }
    case 'footnoteReference':
      return node.value ? `[${node.value}]` : '';
    default:
      return (node.children ?? []).map(inlineText).join('');
  }
}

function blockLines(node: MarkdownNode, depth = 0): string[] {
  switch (node.type) {
    case 'root':
      return (node.children ?? []).flatMap((child) => [...blockLines(child, depth), '']);
    case 'heading':
    case 'paragraph':
      return [inlineText(node)];
    case 'code':
      return (node.value ?? '').split(/\r?\n/u);
    case 'blockquote':
      return (node.children ?? [])
        .flatMap((child) => blockLines(child, depth))
        .map((line) => (line ? `> ${line}` : '>'));
    case 'list': {
      const start = node.ordered ? node.start ?? 1 : 1;
      return (node.children ?? []).flatMap((child, index) =>
        listItemLines(child, depth, node.ordered ? `${start + index}.` : '-'),
      );
    }
    case 'table':
      return (node.children ?? []).map((row) =>
        (row.children ?? []).map((cell) => inlineText(cell).replace(/\s*\n\s*/gu, ' ')).join('\t'),
      );
    case 'thematicBreak':
      return [''];
    case 'definition':
      return [];
    case 'footnoteDefinition': {
      const body = (node.children ?? []).flatMap((child) => blockLines(child, depth)).join(' ');
      return [`[${node.value ?? ''}] ${body}`.trimEnd()];
    }
    case 'html':
      return node.value ? [node.value.replace(/<[^>]*>/gu, '').trim()] : [];
    default: {
      const text = inlineText(node);
      return text ? [text] : [];
    }
  }
}

function listItemLines(node: MarkdownNode, depth: number, marker: string): string[] {
  const indent = '  '.repeat(depth);
  const taskMarker =
    typeof node.checked === 'boolean' ? `${node.checked ? '[x]' : '[ ]'} ` : '';
  const children = node.children ?? [];
  const lines: string[] = [];

  children.forEach((child, childIndex) => {
    if (child.type === 'list') {
      lines.push(...blockLines(child, depth + 1));
      return;
    }

    const childLines = blockLines(child, depth + 1);
    childLines.forEach((line, lineIndex) => {
      if (childIndex === 0 && lineIndex === 0) {
        lines.push(`${indent}${marker} ${taskMarker}${line}`.trimEnd());
      } else {
        lines.push(`${indent}  ${line}`.trimEnd());
      }
    });
  });

  return lines;
}

export function markdownToPlainText(markdown: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownNode;
  const rawLines = blockLines(tree);
  const normalizedLines: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/[\t ]+$/gu, '');
    if (line === '' && normalizedLines.at(-1) === '') {
      continue;
    }
    normalizedLines.push(line);
  }

  while (normalizedLines[0] === '') {
    normalizedLines.shift();
  }
  while (normalizedLines.at(-1) === '') {
    normalizedLines.pop();
  }

  return normalizedLines.join('\n');
}

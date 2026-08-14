import { describe, expect, it } from 'vitest';
import { markdownDownloadContent } from './files';

describe('markdownDownloadContent', () => {
  it('[正常系] 元ファイル名と更新日時を YAML frontmatter に保持する', () => {
    expect(markdownDownloadContent('# 本文', 'source.pdf', 1_750_138_400_000)).toBe(
      '---\n' +
        'title: "source.pdf"\n' +
        'originalUpdatedAt: "2025-06-17T05:33:20.000Z"\n' +
        '---\n\n' +
        '# 本文',
    );
  });

  it('[境界値] 引用符を含むファイル名を壊さず、epoch を ISO 8601 に変換する', () => {
    const content = markdownDownloadContent('本文', '見積書 "確定".pdf', 0);

    expect(content).toContain('title: "見積書 \\"確定\\".pdf"');
    expect(content).toContain('originalUpdatedAt: "1970-01-01T00:00:00.000Z"');
    expect(content.endsWith('\n\n本文')).toBe(true);
  });
});

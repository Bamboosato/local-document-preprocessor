import { describe, expect, it } from 'vitest';
import { markdownToPlainText } from './markdownToPlainText';

describe('markdownToPlainText', () => {
  it('preserves the halfwidth-katakana regression string exactly', () => {
    const expected = 'ICT本部品質技術ｿﾘｭｰｼｮﾝ部ｿﾘｭｰｼｮﾝ第一課';

    expect(markdownToPlainText(expected)).toBe(expected);
  });

  it('renders structure deterministically without trailing blank lines', () => {
    const markdown = [
      '# 見出し',
      '',
      '- 一件目',
      '- [x] 確認済み',
      '',
      '| 氏名 | 社員番号 |',
      '| --- | --- |',
      '| 山田太郎 | A-001 |',
    ].join('\n');

    expect(markdownToPlainText(markdown)).toBe(
      ['見出し', '', '- 一件目', '- [x] 確認済み', '', '氏名\t社員番号', '山田太郎\tA-001'].join(
        '\n',
      ),
    );
    expect(markdownToPlainText(markdown)).toBe(markdownToPlainText(markdown));
  });

  it('keeps link destinations but never includes image source URLs', () => {
    expect(
      markdownToPlainText(
        '[参照資料](https://example.invalid/document) ![組織図](https://example.invalid/image.png)',
      ),
    ).toBe('参照資料 (https://example.invalid/document) [画像: 組織図]');
  });

  it('does not normalize combining characters', () => {
    const decomposed = 'は\u3099';

    expect(markdownToPlainText(decomposed)).toBe(decomposed);
  });
});

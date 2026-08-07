import { describe, expect, it } from 'vitest';
import {
  assessConversion,
  inspectTextAnomalies,
} from './assessConversion';

const encoder = new TextEncoder();

function assess(overrides: Partial<Parameters<typeof assessConversion>[0]> = {}) {
  return assessConversion({
    bytes: encoder.encode('name,email\n山田太郎,yamada@example.jp'),
    finalText: '山田太郎 yamada@example.jp',
    primaryText: '山田太郎 yamada@example.jp',
    detectedFormat: 'csv',
    fileName: 'people.csv',
    disposition: 'success',
    extractionSource: 'anydoc',
    ...overrides,
  });
}

describe('assessConversion', () => {
  it('[正常系] 原本照合を必須としつつ、安全な出力だけを export 可能にする', () => {
    const quality = assess();

    expect(quality.disposition).toBe('success');
    expect(quality.safeToExport).toBe(true);
    expect(quality.issues.map((issue) => issue.code)).toContain('sourceComparisonRequired');
  });

  it('[異常系] Type0 かつ ToUnicode 欠落を重大警告として記録する', () => {
    const quality = assess({
      bytes: encoder.encode('%PDF-1.7 /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5'),
      finalText: 'ICT本部品質技術部',
      primaryText: 'ICT本部品質技術部',
      detectedFormat: 'pdf',
      fileName: 'source.pdf',
    });

    expect(quality.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pdfType0WithoutToUnicode', severity: 'high' }),
      ]),
    );
  });

  it('[正常系回帰] ToUnicode がある正常 PDF を構造異常扱いしない', () => {
    const quality = assess({
      bytes: encoder.encode('%PDF-1.7 /Subtype /Type0 /ToUnicode 12 0 R'),
      finalText: '完全なテキスト',
      primaryText: '完全なテキスト',
      detectedFormat: 'pdf',
      fileName: 'source.pdf',
    });

    expect(quality.issues.map((issue) => issue.code)).not.toContain(
      'pdfType0WithoutToUnicode',
    );
  });

  it('[境界値] U+FFFD、C1 制御、CJK 部首補助、孤立サロゲートを別々に数える', () => {
    expect(inspectTextAnomalies(`欠落�\u0080\u2F00\uD800`)).toEqual({
      replacementCharacters: 1,
      suspiciousControls: 1,
      suspiciousUnicode: 2,
    });
  });

  it('[状態遷移] failed はプレビュー出力を export 不可にする', () => {
    const quality = assess({ disposition: 'failed', encodingSuspect: true });

    expect(quality.safeToExport).toBe(false);
    expect(quality.issues.map((issue) => issue.code)).toContain('encoding_suspect');
  });
});

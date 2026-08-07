import { describe, expect, it } from 'vitest';
import type { PdfTextExtractor } from '../converter/PdfTextExtractor';
import { finalizeConversion } from './finalizeConversion';

const encoder = new TextEncoder();
const expected = 'ICT本部品質技術ｿﾘｭｰｼｮﾝ部ｿﾘｭｰｼｮﾝ第一課';

function extractor(pages: string[], unicodeMapErrorCount = 0): PdfTextExtractor {
  return {
    extract: async () => ({ pages, unicodeMapErrorCount }),
  };
}

function pdfBytes(extra = ''): Uint8Array {
  return encoder.encode(`%PDF-1.7 /Subtype /Type0 ${extra}`);
}

describe('finalizeConversion', () => {
  it('[異常系回帰] 文字化けした anydoc 出力を推測置換せず客観的に改善し partial にする', async () => {
    const result = await finalizeConversion({
      bytes: pdfBytes('/Encoding /UniJIS-UCS2-H'),
      fileName: 'type0-no-tounicode.pdf',
      converted: { markdown: 'ICT本部品質技術��������', detectedFormat: 'pdf' },
      pdfTextExtractor: extractor([`回帰試験\r\n${expected}\r\n完了`]),
    });

    expect(result.quality.disposition).toBe('partial');
    expect(result.quality.extractionSource).toBe('pdfium_fallback');
    expect(result.quality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['encoding_suspect', 'pdf_text_fallback']),
    );
    expect(result.markdown).toContain(expected);
    expect(result.plainText).toContain(expected);
    expect(result.markdown).not.toContain('�');
    expect(result.plainText).not.toContain('�');
  });

  it('[異常系] 独立抽出でも改善しない保証不能な結果は failed にする', async () => {
    const result = await finalizeConversion({
      bytes: pdfBytes(),
      fileName: 'unrecoverable.pdf',
      converted: { markdown: '壊れた�', detectedFormat: 'pdf' },
      pdfTextExtractor: extractor(['別の�']),
    });

    expect(result.quality.disposition).toBe('failed');
    expect(result.quality.safeToExport).toBe(false);
  });

  it('[境界値回帰] Type0 PDF の1文字欠落も客観比較で検出して補完せず差し替える', async () => {
    const oneCharacterMissing = expected.replace('第一課', '第課');
    const result = await finalizeConversion({
      bytes: pdfBytes('/Encoding /UniJIS-UCS2-H'),
      fileName: 'one-character-missing.pdf',
      converted: { markdown: oneCharacterMissing, detectedFormat: 'pdf' },
      pdfTextExtractor: extractor([expected]),
    });

    expect(result.quality.disposition).toBe('partial');
    expect(result.quality.extractionSource).toBe('pdfium_fallback');
    expect(result.markdown).toContain(expected);
    expect(result.plainText).toContain(expected);
  });

  it('[異常系境界] Type0/ToUnicode 欠落は独立抽出が一致しても success にしない', async () => {
    const result = await finalizeConversion({
      bytes: pdfBytes('/Encoding /UniJIS-UCS2-H'),
      fileName: 'type0-agreement.pdf',
      converted: { markdown: expected, detectedFormat: 'pdf' },
      pdfTextExtractor: extractor([expected]),
    });

    expect(result.quality.disposition).toBe('partial');
    expect(result.quality.extractionSource).toBe('anydoc');
    expect(result.quality.issues.map((issue) => issue.code)).toContain(
      'pdfType0WithoutToUnicode',
    );
  });

  it('[正常系回帰] 正常 PDF で独立抽出が一致する場合は partial にしない', async () => {
    const result = await finalizeConversion({
      bytes: pdfBytes('/ToUnicode 8 0 R'),
      fileName: 'normal.pdf',
      converted: { markdown: '正常な日本語 PDF', detectedFormat: 'pdf' },
      pdfTextExtractor: extractor(['正常な日本語 PDF']),
    });

    expect(result.quality.disposition).toBe('success');
    expect(result.quality.extractionSource).toBe('anydoc');
    expect(result.quality.issues.map((issue) => issue.code)).not.toContain(
      'encoding_suspect',
    );
  });

  it('[境界値] 全ページが空の画像のみ PDF は OCR 必須の failed にする', async () => {
    const result = await finalizeConversion({
      bytes: pdfBytes(),
      fileName: 'image-only.pdf',
      converted: { markdown: '', detectedFormat: 'pdf' },
      pdfTextExtractor: extractor(['', '  \r\n']),
    });

    expect(result.quality.disposition).toBe('failed');
    expect(result.quality.pagesWithoutText).toBe(2);
    expect(result.quality.issues.map((issue) => issue.code)).toContain('ocr_required');
  });

  it('[状態遷移] テキストページと画像ページの混在は partial にする', async () => {
    const result = await finalizeConversion({
      bytes: pdfBytes('/ToUnicode 8 0 R'),
      fileName: 'mixed.pdf',
      converted: { markdown: '機械可読ページ', detectedFormat: 'pdf' },
      pdfTextExtractor: extractor(['機械可読ページ', '']),
    });

    expect(result.quality.disposition).toBe('partial');
    expect(result.quality.pageCount).toBe(2);
    expect(result.quality.pagesWithoutText).toBe(1);
    expect(result.quality.issues.map((issue) => issue.code)).toContain('mixed_pdf');
  });

  it('[非同期異常] 独立抽出の初期化失敗時は無警告 success にしない', async () => {
    const result = await finalizeConversion({
      bytes: pdfBytes('/ToUnicode 8 0 R'),
      fileName: 'verifier-unavailable.pdf',
      converted: { markdown: '正常そうに見える文字列', detectedFormat: 'pdf' },
      pdfTextExtractor: {
        extract: async () => {
          throw new Error('WASM initialization failed');
        },
      },
    });

    expect(result.quality.disposition).toBe('partial');
    expect(result.quality.issues.map((issue) => issue.code)).toContain(
      'pdf_verification_unavailable',
    );
  });

  it('[正常系・状態遷移] PDFium fallbackでもオプションに従い区切りの有無だけを変える', async () => {
    const base = {
      bytes: pdfBytes('/Encoding /UniJIS-UCS2-H'),
      fileName: 'fallback-pages.pdf',
      converted: { markdown: '壊れた�', detectedFormat: 'pdf' },
      pdfTextExtractor: extractor(['PAGE_ONE', 'PAGE_TWO']),
    };

    const withBreaks = await finalizeConversion({ ...base, insertPageBreaks: true });
    const withoutBreaks = await finalizeConversion({ ...base, insertPageBreaks: false });

    expect(withBreaks.markdown).toBe('PAGE_ONE\n\n---\n\nPAGE_TWO');
    expect(withoutBreaks.markdown).toBe('PAGE_ONE\n\nPAGE_TWO');
    expect(withBreaks.plainText).toBe(withoutBreaks.plainText);
    expect(withBreaks.plainText).not.toContain('---');
  });
});

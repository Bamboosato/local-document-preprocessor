import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import type { Converter } from '../converter/contracts';
import type { PdfPageService } from '../selection/documentSelection';
import { convertWithPageBreaks } from './convertWithPageBreaks';

function pdfService(totalUnits: number): PdfPageService {
  return {
    countPages: vi.fn(async () => totalUnits),
    selectPages: vi.fn(async (_bytes, start) => new Uint8Array([start])),
  };
}

function recordingConverter(calls: number[]): Converter {
  return {
    convert: async ({ bytes }) => {
      const unit = bytes[0] ?? 0;
      calls.push(unit);
      return { markdown: `PAGE_${unit}`, detectedFormat: 'pdf' };
    },
  };
}

function docxBytes(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(`
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>DOCX_ONE</w:t><w:br w:type="page"/>
          <w:t>DOCX_TWO</w:t><w:br w:type="page"/><w:t>DOCX_THREE</w:t>
        </w:r></w:p><w:sectPr/></w:body>
      </w:document>
    `),
  });
}

function docxMarkerConverter(calls: string[]): Converter {
  return {
    convert: async ({ bytes }) => {
      const xml = strFromU8(unzipSync(bytes)['word/document.xml']);
      calls.push(xml);
      const markers = xml.match(/LDPExplicitPageBreakMarkerA7F3A*/g) ?? [];
      return {
        markdown: `DOCX_ONE${markers[0] ?? ''}DOCX_TWO${markers[1] ?? ''}DOCX_THREE`,
        detectedFormat: 'docx',
      };
    },
  };
}

describe('convertWithPageBreaks', () => {
  it('[正常系・状態遷移] オンなら各ページを順番に変換して境界間だけ区切る', async () => {
    const calls: number[] = [];
    const result = await convertWithPageBreaks(
      recordingConverter(calls),
      { fileName: 'three-pages.pdf', bytes: new Uint8Array([99]) },
      true,
      pdfService(3),
    );

    expect(calls).toEqual([1, 2, 3]);
    expect(result.markdown).toBe('PAGE_1\n\n---\n\nPAGE_2\n\n---\n\nPAGE_3');
    expect(result.markdown.match(/^---$/gmu)).toHaveLength(2);
    expect(result.markdown.trim()).not.toMatch(/^(?:---)|(?:---)$/u);
  });

  it('[正常系] オフなら文書を従来どおり1回だけ変換する', async () => {
    const calls: number[] = [];
    const pages = pdfService(3);
    const result = await convertWithPageBreaks(
      recordingConverter(calls),
      { fileName: 'three-pages.pdf', bytes: new Uint8Array([99]) },
      false,
      pages,
    );

    expect(calls).toEqual([99]);
    expect(pages.countPages).not.toHaveBeenCalled();
    expect(result.markdown).toBe('PAGE_99');
  });

  it('[境界値] 1ページだけならオンでも区切りを挿入しない', async () => {
    const calls: number[] = [];
    const result = await convertWithPageBreaks(
      recordingConverter(calls),
      { fileName: 'one-page.pdf', bytes: new Uint8Array([7]) },
      true,
      pdfService(1),
    );

    expect(calls).toEqual([7]);
    expect(result.markdown).toBe('PAGE_7');
    expect(result.markdown).not.toContain('---');
  });

  it('[前提条件] 安定した境界がない形式ではオン指定を無視して本文を分割しない', async () => {
    const calls: number[] = [];
    const result = await convertWithPageBreaks(
      recordingConverter(calls),
      { fileName: 'document.docx', bytes: new Uint8Array([5]) },
      true,
      pdfService(9),
    );

    expect(calls).toEqual([5]);
    expect(result.markdown).toBe('PAGE_5');
  });

  it('[正常系・DOCX] 明示改ページをMarkdownの区切りへ変換する', async () => {
    const calls: string[] = [];
    const result = await convertWithPageBreaks(
      docxMarkerConverter(calls),
      { fileName: 'explicit-breaks.docx', bytes: docxBytes() },
      true,
      pdfService(9),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('LDPExplicitPageBreakMarkerA7F3');
    expect(result.markdown).toBe('DOCX_ONE\n\n---\n\nDOCX_TWO\n\n---\n\nDOCX_THREE');
    expect(result.markdown.match(/^---$/gmu)).toHaveLength(2);
  });

  it('[異常系・DOCX] 改ページマーカーが変換結果から欠落したら成功扱いにしない', async () => {
    const converter: Converter = {
      convert: async () => ({ markdown: 'DOCX_ONLY', detectedFormat: 'docx' }),
    };

    await expect(
      convertWithPageBreaks(
        converter,
        { fileName: 'explicit-breaks.docx', bytes: docxBytes() },
        true,
        pdfService(9),
      ),
    ).rejects.toMatchObject({ code: 'postprocessingFailed' });
  });
});

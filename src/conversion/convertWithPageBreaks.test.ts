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
});

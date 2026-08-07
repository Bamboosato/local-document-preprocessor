import { describe, expect, it } from 'vitest';
import type { Converter } from '../converter/contracts';
import { convertForPipeline } from './convertForPipeline';

function failingConverter(code: string): Converter {
  return {
    convert: async () => {
      const error = new Error(code) as Error & { code: string };
      error.code = code;
      throw error;
    },
  };
}

describe('convertForPipeline', () => {
  it('[異常系] PDF の unsupported だけを画像ページ分類へ引き継ぐ', async () => {
    await expect(
      convertForPipeline(failingConverter('unsupported'), {
        fileName: 'image-only.pdf',
        bytes: new Uint8Array(),
      }),
    ).resolves.toEqual({ markdown: '', detectedFormat: 'pdf' });
  });

  it('[前提条件] PDF の破損エラーは分類を上書きせず伝播する', async () => {
    await expect(
      convertForPipeline(failingConverter('malformed'), {
        fileName: 'broken.pdf',
        bytes: new Uint8Array(),
      }),
    ).rejects.toMatchObject({ code: 'malformed' });
  });

  it('[環境差] PDF 以外の unsupported は従来どおり伝播する', async () => {
    await expect(
      convertForPipeline(failingConverter('unsupported'), {
        fileName: 'unknown.bin',
        bytes: new Uint8Array(),
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });
});

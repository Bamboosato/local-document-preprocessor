import { PDFDocument } from 'pdf-lib';
import { PdfiumTextExtractor } from '../converter/PdfiumTextExtractor';
import type { PdfPageService } from './documentSelection';

export class PdfPageProcessor implements PdfPageService {
  constructor(private readonly extractor: PdfiumTextExtractor) {}

  countPages(bytes: Uint8Array): Promise<number> {
    return this.extractor.countPages(bytes);
  }

  async selectPages(bytes: Uint8Array, start: number, end: number): Promise<Uint8Array> {
    try {
      const source = await PDFDocument.load(bytes, { updateMetadata: false });
      const selected = await PDFDocument.create();
      const indexes = Array.from({ length: end - start + 1 }, (_, index) => start - 1 + index);
      const pages = await selected.copyPages(source, indexes);
      pages.forEach((page) => selected.addPage(page));
      return await selected.save({ addDefaultPage: false, useObjectStreams: false });
    } catch {
      const error = Object.assign(new Error('The selected PDF pages could not be prepared.'), {
        code: 'malformed' as const,
      });
      throw error;
    }
  }
}

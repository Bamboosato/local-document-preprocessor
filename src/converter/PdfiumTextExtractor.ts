import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import type { WrappedPdfiumModule } from '@embedpdf/pdfium';
import type { PdfTextExtraction, PdfTextExtractor } from './PdfTextExtractor';

type PdfiumWithHeap = WrappedPdfiumModule & {
  pdfium: WrappedPdfiumModule['pdfium'] & { HEAPU8: Uint8Array };
};

export class PdfiumTextExtractor implements PdfTextExtractor {
  private modulePromise: Promise<PdfiumWithHeap> | undefined;

  async countPages(bytes: Uint8Array): Promise<number> {
    const pdfium = await this.loadModule();
    const pointer = pdfium.pdfium.wasmExports.malloc(bytes.byteLength);
    pdfium.pdfium.HEAPU8.set(bytes, pointer);
    const document = pdfium.FPDF_LoadMemDocument64(pointer, bytes.byteLength, '');

    if (!document) {
      pdfium.pdfium.wasmExports.free(pointer);
      const code = pdfium.FPDF_GetLastError() === 4 ? 'encrypted' : 'malformed';
      throw Object.assign(new Error('The PDF structure could not be inspected.'), { code });
    }

    try {
      return pdfium.FPDF_GetPageCount(document);
    } finally {
      pdfium.FPDF_CloseDocument(document);
      pdfium.pdfium.wasmExports.free(pointer);
    }
  }

  async extract(bytes: Uint8Array): Promise<PdfTextExtraction> {
    const pdfium = await this.loadModule();
    const pointer = pdfium.pdfium.wasmExports.malloc(bytes.byteLength);
    pdfium.pdfium.HEAPU8.set(bytes, pointer);
    const document = pdfium.FPDF_LoadMemDocument64(pointer, bytes.byteLength, '');

    if (!document) {
      pdfium.pdfium.wasmExports.free(pointer);
      const code = pdfium.FPDF_GetLastError() === 4 ? 'encrypted' : 'malformed';
      const error = new Error('The independent PDF verifier could not open the PDF.') as Error & {
        code: 'encrypted' | 'malformed';
      };
      error.code = code;
      throw error;
    }

    try {
      const pages: string[] = [];
      let unicodeMapErrorCount = 0;

      for (let pageIndex = 0; pageIndex < pdfium.FPDF_GetPageCount(document); pageIndex += 1) {
        const page = pdfium.FPDF_LoadPage(document, pageIndex);
        if (!page) {
          pages.push('');
          continue;
        }

        const textPage = pdfium.FPDFText_LoadPage(page);
        if (!textPage) {
          pdfium.FPDF_ClosePage(page);
          pages.push('');
          continue;
        }

        try {
          const characters: string[] = [];
          const characterCount = pdfium.FPDFText_CountChars(textPage);
          for (let index = 0; index < characterCount; index += 1) {
            if (pdfium.FPDFText_HasUnicodeMapError(textPage, index)) {
              unicodeMapErrorCount += 1;
            }
            const codePoint = pdfium.FPDFText_GetUnicode(textPage, index);
            characters.push(
              codePoint >= 0 && codePoint <= 0x10ffff
                ? String.fromCodePoint(codePoint)
                : '\uFFFD',
            );
          }
          pages.push(characters.join(''));
        } finally {
          pdfium.FPDFText_ClosePage(textPage);
          pdfium.FPDF_ClosePage(page);
        }
      }

      return { pages, unicodeMapErrorCount };
    } finally {
      pdfium.FPDF_CloseDocument(document);
      pdfium.pdfium.wasmExports.free(pointer);
    }
  }

  private loadModule(): Promise<PdfiumWithHeap> {
    if (!this.modulePromise) {
      this.modulePromise = Promise.all([
        import('@embedpdf/pdfium'),
        fetch(pdfiumWasmUrl).then((response) => {
          if (!response.ok) {
            throw new Error(`PDFium WASM returned HTTP ${response.status}.`);
          }
          return response.arrayBuffer();
        }),
      ])
        .then(async ([module, wasmBinary]) => {
          const pdfium = (await module.init({ wasmBinary })) as PdfiumWithHeap;
          pdfium.PDFiumExt_Init();
          return pdfium;
        })
        .catch((error) => {
          this.modulePromise = undefined;
          throw error;
        });
    }

    return this.modulePromise;
  }
}

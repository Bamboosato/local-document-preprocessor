export interface PdfTextExtraction {
  pages: string[];
  unicodeMapErrorCount: number;
}

export interface PdfTextExtractor {
  extract(bytes: Uint8Array): Promise<PdfTextExtraction>;
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_COUNT = 20;

export const SUPPORTED_EXTENSIONS = [
  '.doc',
  '.docx',
  '.docm',
  '.ppt',
  '.pps',
  '.pot',
  '.pptx',
  '.pptm',
  '.ppsx',
  '.ppsm',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.xlsb',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  '.epub',
  '.csv',
  '.pdf',
] as const;

export type ConversionErrorCode =
  | 'unsupported'
  | 'malformed'
  | 'encrypted'
  | 'resourceLimit'
  | 'missingPart'
  | 'appFileTooLarge'
  | 'initializationFailed'
  | 'conversionFailed'
  | 'postprocessingFailed'
  | 'invalidSelection'
  | 'unknown';

export type QualityIssueCode =
  | 'sourceComparisonRequired'
  | 'pdfOriginalComparisonRequired'
  | 'pdfType0WithoutToUnicode'
  | 'replacementCharacterFound'
  | 'suspiciousControlCharacterFound'
  | 'suspiciousUnicodeCharacterFound'
  | 'suspiciouslyShortOutput'
  | 'encoding_suspect'
  | 'pdf_text_fallback'
  | 'pdf_verification_unavailable'
  | 'ocr_required'
  | 'mixed_pdf';

export interface QualityIssue {
  code: QualityIssueCode;
  severity: 'warning' | 'high';
  message: string;
}

export type ConversionDisposition = 'success' | 'partial' | 'failed';

export interface ConversionQuality {
  reviewRequired: true;
  disposition: ConversionDisposition;
  safeToExport: boolean;
  extractionSource: 'anydoc' | 'pdfium_fallback';
  outputCharacterCount: number;
  pageCount?: number;
  pagesWithoutText?: number;
  issues: QualityIssue[];
}

export interface ConverterInput {
  fileName: string;
  bytes: Uint8Array;
}

export type SelectionKind = 'pages' | 'slides' | 'sheets' | 'document';

export interface SheetInfo {
  name: string;
  index: number;
  hidden: boolean;
}

export interface DocumentInspection {
  selectionKind: SelectionKind;
  supportsSelection: boolean;
  totalUnits?: number;
  sheets: SheetInfo[];
}

export type DocumentSelection =
  | { mode: 'all' }
  | { mode: 'range'; start: number; end: number }
  | { mode: 'sheets'; sheetNames: string[] };

export interface ConversionOptions {
  insertPageBreaks: boolean;
}

export const DEFAULT_CONVERSION_OPTIONS: Readonly<ConversionOptions> = {
  insertPageBreaks: true,
};

export interface ConverterOutput {
  markdown: string;
  detectedFormat?: string;
}

export interface ConversionResult extends ConverterOutput {
  plainText: string;
  quality: ConversionQuality;
}

export interface Converter {
  convert(input: ConverterInput): Promise<ConverterOutput>;
}

export interface SerializedConversionError {
  code: ConversionErrorCode;
}

export interface ConvertRequest {
  type: 'convert';
  id: string;
  fileName: string;
  buffer: ArrayBuffer;
  selection: DocumentSelection;
  options: ConversionOptions;
}

export interface InspectRequest {
  type: 'inspect';
  id: string;
  fileName: string;
  buffer: ArrayBuffer;
}

export type WorkerRequest = ConvertRequest | InspectRequest;

export type WorkerResponse =
  | {
      type: 'convert-success';
      id: string;
      result: ConversionResult;
    }
  | {
      type: 'inspect-success';
      id: string;
      inspection: DocumentInspection;
    }
  | {
      type: 'error';
      id: string;
      error: SerializedConversionError;
    };

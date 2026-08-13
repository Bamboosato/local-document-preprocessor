import { unzipSync, zipSync, type Unzipped } from 'fflate';
import type {
  DocumentInspection,
  DocumentSelection,
  SheetInfo,
} from '../converter/contracts';

const PRESENTATION_EXTENSIONS = new Set(['.pptx', '.pptm', '.ppsx', '.ppsm']);
const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xlsm']);
const PRESENTATION_XML = 'ppt/presentation.xml';
const WORKBOOK_XML = 'xl/workbook.xml';
const DOCX_DOCUMENT_XML = 'word/document.xml';
const DOCX_EXTENSIONS = new Set(['.docx']);
const MAX_STRUCTURE_XML_BYTES = 8 * 1024 * 1024;
const MAX_REPACKED_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const DOCX_PAGE_BREAK_MARKER_BASE = 'LDPExplicitPageBreakMarkerA7F3';

export interface PdfPageService {
  countPages(bytes: Uint8Array): Promise<number>;
  selectPages(bytes: Uint8Array, start: number, end: number): Promise<Uint8Array>;
}

interface XmlElementContent {
  inner: string;
  innerStart: number;
  innerEnd: number;
}

function codedError(
  code: 'malformed' | 'missingPart' | 'resourceLimit' | 'invalidSelection',
  message: string,
): Error & { code: typeof code } {
  return Object.assign(new Error(message), { code });
}

function hasErrorCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function extensionOf(fileName: string): string {
  const separator = fileName.lastIndexOf('.');
  return separator >= 0 ? fileName.slice(separator).toLocaleLowerCase('en-US') : '';
}

function decodeXmlAttribute(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu,
    (entity) => {
      switch (entity.toLocaleLowerCase('en-US')) {
        case '&amp;': return '&';
        case '&lt;': return '<';
        case '&gt;': return '>';
        case '&quot;': return '"';
        case '&apos;': return "'";
        default: {
          const hexadecimal = entity.startsWith('&#x') || entity.startsWith('&#X');
          const digits = entity.slice(hexadecimal ? 3 : 2, -1);
          const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
          return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : entity;
        }
      }
    },
  );
}

function attribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu'));
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? undefined : decodeXmlAttribute(value);
}

function elementContent(xml: string, localName: string): XmlElementContent {
  const prefix = '(?:[\\w.-]+:)?';
  const match = new RegExp(
    `<${prefix}${localName}\\b[^>]*>([\\s\\S]*?)<\\/${prefix}${localName}\\s*>`,
    'iu',
  ).exec(xml);
  if (!match || match.index === undefined) {
    throw codedError('missingPart', `Required ${localName} structure is missing.`);
  }
  const inner = match[1] ?? '';
  const offset = match[0].indexOf(inner);
  const innerStart = match.index + offset;
  return { inner, innerStart, innerEnd: innerStart + inner.length };
}

function childTags(xml: string, localName: string): string[] {
  const prefix = '(?:[\\w.-]+:)?';
  return Array.from(
    xml.matchAll(
      new RegExp(
        `<${prefix}${localName}\\b[^>]*(?:\\/\\s*>|>[\\s\\S]*?<\\/${prefix}${localName}\\s*>)`,
        'giu',
      ),
    ),
    (match) => match[0],
  );
}

function decodeXml(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw codedError('malformed', 'The document structure is not valid UTF-8 XML.');
  }
}

function readXmlEntry(bytes: Uint8Array, path: string): string {
  let entryCount = 0;
  try {
    const archive = unzipSync(bytes, {
      filter: (entry) => {
        entryCount += 1;
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          throw codedError('resourceLimit', 'The document contains too many package entries.');
        }
        if (entry.name !== path) return false;
        if (entry.originalSize > MAX_STRUCTURE_XML_BYTES) {
          throw codedError('resourceLimit', 'The document structure exceeds the inspection limit.');
        }
        return true;
      },
    });
    const content = archive[path];
    if (!content) {
      throw codedError('missingPart', `Required package part ${path} is missing.`);
    }
    return decodeXml(content);
  } catch (error) {
    if (hasErrorCode(error)) throw error;
    throw codedError('malformed', 'The Office package could not be inspected.');
  }
}

function readArchiveForSelection(bytes: Uint8Array): Unzipped {
  let entryCount = 0;
  let expandedBytes = 0;
  try {
    return unzipSync(bytes, {
      filter: (entry) => {
        entryCount += 1;
        expandedBytes += entry.originalSize;
        if (entryCount > MAX_ARCHIVE_ENTRIES || expandedBytes > MAX_REPACKED_BYTES) {
          throw codedError('resourceLimit', 'The selected Office package exceeds the safe expansion limit.');
        }
        return true;
      },
    });
  } catch (error) {
    if (hasErrorCode(error)) throw error;
    throw codedError('malformed', 'The Office package could not be prepared.');
  }
}

function rewriteXmlEntry(
  bytes: Uint8Array,
  path: string,
  rewrite: (xml: string) => string,
): Uint8Array {
  const archive = readArchiveForSelection(bytes);
  const content = archive[path];
  if (!content) {
    throw codedError('missingPart', `Required package part ${path} is missing.`);
  }
  archive[path] = new TextEncoder().encode(rewrite(decodeXml(content)));
  try {
    return zipSync(archive, { level: 6 });
  } catch {
    throw codedError('resourceLimit', 'The selected Office package could not be recompressed safely.');
  }
}

function docxPageBreakTag(): RegExp {
  return /<(?:[\w.-]+:)?br\b(?=[^>]*\b(?:[\w.-]+:)?type\s*=\s*(?:"page"|'page'))[^>]*\/\s*>/giu;
}

function countExplicitDocxPageBreaks(xml: string): number {
  return xml.match(docxPageBreakTag())?.length ?? 0;
}

export interface DocxPageBreakPreparation {
  bytes: Uint8Array;
  count: number;
  marker: string;
}

export function countDocxPageBreaks(bytes: Uint8Array): number {
  return countExplicitDocxPageBreaks(readXmlEntry(bytes, DOCX_DOCUMENT_XML));
}

export function prepareDocxPageBreaks(bytes: Uint8Array): DocxPageBreakPreparation {
  const xml = readXmlEntry(bytes, DOCX_DOCUMENT_XML);
  let marker = DOCX_PAGE_BREAK_MARKER_BASE;
  while (xml.includes(marker)) marker += 'A';

  let count = 0;
  const rewrittenXml = xml.replace(docxPageBreakTag(), () => {
    count += 1;
    return `<w:t xml:space="preserve">${marker}</w:t>`;
  });

  return {
    bytes: count === 0 ? bytes : rewriteXmlEntry(bytes, DOCX_DOCUMENT_XML, () => rewrittenXml),
    count,
    marker,
  };
}

function presentationCount(bytes: Uint8Array): number {
  const xml = readXmlEntry(bytes, PRESENTATION_XML);
  const slides = childTags(elementContent(xml, 'sldIdLst').inner, 'sldId');
  if (slides.length === 0) {
    throw codedError('malformed', 'The presentation does not contain any slides.');
  }
  return slides.length;
}

function workbookSheets(bytes: Uint8Array): SheetInfo[] {
  const xml = readXmlEntry(bytes, WORKBOOK_XML);
  const tags = childTags(elementContent(xml, 'sheets').inner, 'sheet');
  const sheets = tags.map((tag, index) => {
    const name = attribute(tag, 'name');
    if (!name) {
      throw codedError('malformed', 'A workbook sheet name is missing.');
    }
    const state = attribute(tag, 'state');
    return {
      name,
      index: index + 1,
      hidden: state !== undefined && state !== 'visible',
    };
  });
  if (sheets.length === 0) {
    throw codedError('malformed', 'The workbook does not contain any sheets.');
  }
  return sheets;
}

export async function inspectDocument(
  fileName: string,
  bytes: Uint8Array,
  pdfPages: PdfPageService,
): Promise<DocumentInspection> {
  const extension = extensionOf(fileName);
  if (DOCX_EXTENSIONS.has(extension)) {
    try {
      return {
        selectionKind: 'document',
        supportsSelection: false,
        sheets: [],
        explicitPageBreakCount: countDocxPageBreaks(bytes),
      };
    } catch {
      // Keep document-level inspection available; anydoc remains responsible for
      // classifying malformed DOCX input during conversion.
      return { selectionKind: 'document', supportsSelection: false, sheets: [] };
    }
  }
  if (extension === '.pdf') {
    const totalUnits = await pdfPages.countPages(bytes);
    if (totalUnits < 1) throw codedError('malformed', 'The PDF does not contain any pages.');
    return { selectionKind: 'pages', supportsSelection: true, totalUnits, sheets: [] };
  }
  if (PRESENTATION_EXTENSIONS.has(extension)) {
    return {
      selectionKind: 'slides',
      supportsSelection: true,
      totalUnits: presentationCount(bytes),
      sheets: [],
    };
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    const sheets = workbookSheets(bytes);
    return {
      selectionKind: 'sheets',
      supportsSelection: true,
      totalUnits: sheets.length,
      sheets,
    };
  }
  return { selectionKind: 'document', supportsSelection: false, sheets: [] };
}

function validateRange(selection: Extract<DocumentSelection, { mode: 'range' }>, total: number): void {
  if (
    !Number.isInteger(selection.start) ||
    !Number.isInteger(selection.end) ||
    selection.start < 1 ||
    selection.end < selection.start ||
    selection.end > total
  ) {
    throw codedError('invalidSelection', 'The requested range is outside the document.');
  }
}

export async function prepareStableRange(
  bytes: Uint8Array,
  inspection: DocumentInspection,
  start: number,
  end: number,
  pdfPages: PdfPageService,
): Promise<Uint8Array> {
  if (
    (inspection.selectionKind !== 'pages' && inspection.selectionKind !== 'slides') ||
    inspection.totalUnits === undefined
  ) {
    throw codedError('invalidSelection', 'This document does not have stable selectable pages.');
  }

  validateRange({ mode: 'range', start, end }, inspection.totalUnits);
  if (start === 1 && end === inspection.totalUnits) return bytes;
  return inspection.selectionKind === 'pages'
    ? pdfPages.selectPages(bytes, start, end)
    : selectPresentation(bytes, start, end);
}

function selectPresentation(bytes: Uint8Array, start: number, end: number): Uint8Array {
  return rewriteXmlEntry(bytes, PRESENTATION_XML, (xml) => {
    const list = elementContent(xml, 'sldIdLst');
    const slides = childTags(list.inner, 'sldId');
    const selected = slides.slice(start - 1, end).join('');
    return `${xml.slice(0, list.innerStart)}${selected}${xml.slice(list.innerEnd)}`;
  });
}

function selectWorkbook(bytes: Uint8Array, selectedNames: Set<string>): Uint8Array {
  return rewriteXmlEntry(bytes, WORKBOOK_XML, (xml) => {
    const list = elementContent(xml, 'sheets');
    const selected = childTags(list.inner, 'sheet')
      .filter((tag) => {
        const name = attribute(tag, 'name');
        return name !== undefined && selectedNames.has(name);
      })
      .join('');
    return `${xml.slice(0, list.innerStart)}${selected}${xml.slice(list.innerEnd)}`;
  });
}

export async function prepareSelectedDocument(
  fileName: string,
  bytes: Uint8Array,
  selection: DocumentSelection,
  pdfPages: PdfPageService,
): Promise<Uint8Array> {
  if (selection.mode === 'all') return bytes;

  const inspection = await inspectDocument(fileName, bytes, pdfPages);
  if (selection.mode === 'range') {
    return prepareStableRange(
      bytes,
      inspection,
      selection.start,
      selection.end,
      pdfPages,
    );
  }

  if (inspection.selectionKind !== 'sheets') {
    throw codedError('invalidSelection', 'Sheet selection is available only for supported workbooks.');
  }
  const selectedNames = new Set(selection.sheetNames);
  if (selectedNames.size === 0 || selectedNames.size !== selection.sheetNames.length) {
    throw codedError('invalidSelection', 'At least one unique sheet must be selected.');
  }
  const existing = new Set(inspection.sheets.map((sheet) => sheet.name));
  if (selection.sheetNames.some((name) => !existing.has(name))) {
    throw codedError('invalidSelection', 'A selected sheet does not exist in the workbook.');
  }
  if (selectedNames.size === inspection.sheets.length) return bytes;
  return selectWorkbook(bytes, selectedNames);
}

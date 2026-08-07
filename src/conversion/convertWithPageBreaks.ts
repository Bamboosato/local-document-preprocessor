import type {
  Converter,
  ConverterInput,
  ConverterOutput,
} from '../converter/contracts';
import {
  inspectDocument,
  prepareStableRange,
  type PdfPageService,
} from '../selection/documentSelection';
import { convertForPipeline } from './convertForPipeline';

const PAGE_BREAK_SEPARATOR = '\n\n---\n\n';

export async function convertWithPageBreaks(
  converter: Converter,
  input: ConverterInput,
  insertPageBreaks: boolean,
  pdfPages: PdfPageService,
): Promise<ConverterOutput> {
  if (!insertPageBreaks) return convertForPipeline(converter, input);

  const inspection = await inspectDocument(input.fileName, input.bytes, pdfPages);
  if (
    (inspection.selectionKind !== 'pages' && inspection.selectionKind !== 'slides') ||
    inspection.totalUnits === undefined ||
    inspection.totalUnits <= 1
  ) {
    return convertForPipeline(converter, input);
  }

  const unitMarkdown: string[] = [];
  let detectedFormat: string | undefined;
  for (let unit = 1; unit <= inspection.totalUnits; unit += 1) {
    const unitBytes = await prepareStableRange(
      input.bytes,
      inspection,
      unit,
      unit,
      pdfPages,
    );
    const converted = await convertForPipeline(converter, {
      fileName: input.fileName,
      bytes: unitBytes,
    });
    detectedFormat ??= converted.detectedFormat;
    unitMarkdown.push(converted.markdown.trim());
  }

  return {
    markdown: unitMarkdown.join(PAGE_BREAK_SEPARATOR),
    detectedFormat,
  };
}

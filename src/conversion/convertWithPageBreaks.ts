import type {
  Converter,
  ConverterInput,
  ConverterOutput,
} from '../converter/contracts';
import {
  prepareDocxPageBreaks,
  inspectDocument,
  prepareStableRange,
  type PdfPageService,
} from '../selection/documentSelection';
import { convertForPipeline } from './convertForPipeline';

const PAGE_BREAK_SEPARATOR = '\n\n---\n\n';

function pageBreakProcessingError(message: string): Error & { code: 'postprocessingFailed' } {
  const error = new Error(message) as Error & { code: 'postprocessingFailed' };
  error.code = 'postprocessingFailed';
  return error;
}

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
    if ((inspection.explicitPageBreakCount ?? 0) > 0) {
      const prepared = prepareDocxPageBreaks(input.bytes);
      const converted = await convertForPipeline(converter, {
        fileName: input.fileName,
        bytes: prepared.bytes,
      });
      const markerCount = converted.markdown.split(prepared.marker).length - 1;
      if (markerCount !== prepared.count) {
        throw pageBreakProcessingError('The DOCX page-break marker was not preserved by conversion.');
      }
      return {
        ...converted,
        markdown: converted.markdown.split(prepared.marker).join(PAGE_BREAK_SEPARATOR),
      };
    }
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

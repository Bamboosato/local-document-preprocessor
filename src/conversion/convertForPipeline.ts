import type {
  Converter,
  ConverterInput,
  ConverterOutput,
} from '../converter/contracts';

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
}

export async function convertForPipeline(
  converter: Converter,
  input: ConverterInput,
): Promise<ConverterOutput> {
  try {
    return await converter.convert(input);
  } catch (error) {
    const isPdf = input.fileName.toLocaleLowerCase('en-US').endsWith('.pdf');
    if (isPdf && errorCode(error) === 'unsupported') {
      // anydoc rejects image-only PDFs before returning an empty result. Keep
      // the flow inside the Worker so PDFium can distinguish image-only from
      // a text/image mixed document and report the explicit OCR boundary.
      return { markdown: '', detectedFormat: 'pdf' };
    }
    throw error;
  }
}

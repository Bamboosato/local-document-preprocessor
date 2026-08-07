import type {
  ConversionResult,
  ConverterOutput,
} from '../converter/contracts';
import type { PdfTextExtractor } from '../converter/PdfTextExtractor';
import { markdownToPlainText } from '../plainText/markdownToPlainText';
import {
  assessConversion,
  hasType0WithoutToUnicode,
  isPdfInput,
  textAnomalyScore,
} from '../quality/assessConversion';

interface FinalizeConversionInput {
  bytes: Uint8Array;
  fileName: string;
  converted: ConverterOutput;
  pdfTextExtractor: PdfTextExtractor;
  insertPageBreaks?: boolean;
}

interface TextCoverage {
  alternateCharacters: number;
  missingFromPrimary: number;
}

function compactForComparison(text: string): string {
  return Array.from(text).filter((character) => !/\s/u.test(character)).join('');
}

function compareTextCoverage(primary: string, alternate: string): TextCoverage {
  const primaryCounts = new Map<string, number>();
  for (const character of compactForComparison(primary)) {
    primaryCounts.set(character, (primaryCounts.get(character) ?? 0) + 1);
  }

  let alternateCharacters = 0;
  let missingFromPrimary = 0;
  for (const character of compactForComparison(alternate)) {
    alternateCharacters += 1;
    const remaining = primaryCounts.get(character) ?? 0;
    if (remaining > 0) {
      primaryCounts.set(character, remaining - 1);
    } else {
      missingFromPrimary += 1;
    }
  }

  return { alternateCharacters, missingFromPrimary };
}

function fallbackMarkdown(pages: string[], insertPageBreaks: boolean): string {
  const separator = insertPageBreaks ? '\n\n---\n\n' : '\n\n';
  return pages.map((page) => page.trim()).join(separator).trim();
}

export async function finalizeConversion({
  bytes,
  fileName,
  converted,
  pdfTextExtractor,
  insertPageBreaks = false,
}: FinalizeConversionInput): Promise<ConversionResult> {
  const primaryPlainText = markdownToPlainText(converted.markdown);
  const pdf = isPdfInput(fileName, converted.detectedFormat);

  if (!pdf) {
    const anomalyScore = textAnomalyScore(primaryPlainText);
    const disposition = anomalyScore > 0 ? 'partial' : 'success';
    return {
      ...converted,
      plainText: primaryPlainText,
      quality: assessConversion({
        bytes,
        finalText: primaryPlainText,
        primaryText: primaryPlainText,
        detectedFormat: converted.detectedFormat,
        fileName,
        disposition,
        extractionSource: 'anydoc',
        encodingSuspect: anomalyScore > 0,
      }),
    };
  }

  try {
    const verified = await pdfTextExtractor.extract(bytes);
    const pagesWithoutText = verified.pages.filter(
      (page) => compactForComparison(page).length === 0,
    ).length;
    const imageOnlyPdf = verified.pages.length > 0 && pagesWithoutText === verified.pages.length;
    const mixedPdf = pagesWithoutText > 0 && pagesWithoutText < verified.pages.length;
    const alternateMarkdown = fallbackMarkdown(verified.pages, insertPageBreaks);
    const alternatePlainText = markdownToPlainText(alternateMarkdown);
    const coverage = compareTextCoverage(primaryPlainText, alternatePlainText);
    const primaryScore = textAnomalyScore(primaryPlainText);
    const alternateScore = textAnomalyScore(alternatePlainText) + verified.unicodeMapErrorCount;
    const type0WithoutToUnicode = hasType0WithoutToUnicode(bytes);
    const objectiveMismatch =
      type0WithoutToUnicode &&
      coverage.missingFromPrimary > 0;
    const encodingSuspect = primaryScore > 0 || objectiveMismatch;
    const fallbackImproves =
      alternatePlainText.length > 0 &&
      alternateScore === 0 &&
      (primaryScore > alternateScore || objectiveMismatch);

    let markdown = converted.markdown;
    let plainText = primaryPlainText;
    let extractionSource: ConversionResult['quality']['extractionSource'] = 'anydoc';
    let disposition: ConversionResult['quality']['disposition'] = 'success';

    if (imageOnlyPdf) {
      disposition = 'failed';
    } else if (encodingSuspect && fallbackImproves) {
      markdown = alternateMarkdown;
      plainText = alternatePlainText;
      extractionSource = 'pdfium_fallback';
      disposition = 'partial';
    } else if (encodingSuspect) {
      disposition = 'failed';
    } else if (type0WithoutToUnicode) {
      disposition = 'partial';
    } else if (mixedPdf) {
      disposition = 'partial';
    }

    return {
      markdown,
      detectedFormat: converted.detectedFormat,
      plainText,
      quality: assessConversion({
        bytes,
        finalText: plainText,
        primaryText: primaryPlainText,
        detectedFormat: converted.detectedFormat,
        fileName,
        disposition,
        extractionSource,
        pageCount: verified.pages.length,
        pagesWithoutText,
        usedPdfFallback: extractionSource === 'pdfium_fallback',
        encodingSuspect,
        imageOnlyPdf,
        mixedPdf,
      }),
    };
  } catch {
    const encodingSuspect =
      textAnomalyScore(primaryPlainText) > 0 || hasType0WithoutToUnicode(bytes);
    const disposition =
      encodingSuspect || compactForComparison(primaryPlainText).length === 0
        ? 'failed'
        : 'partial';
    return {
      ...converted,
      plainText: primaryPlainText,
      quality: assessConversion({
        bytes,
        finalText: primaryPlainText,
        primaryText: primaryPlainText,
        detectedFormat: converted.detectedFormat,
        fileName,
        disposition,
        extractionSource: 'anydoc',
        encodingSuspect,
        verificationUnavailable: true,
      }),
    };
  }
}

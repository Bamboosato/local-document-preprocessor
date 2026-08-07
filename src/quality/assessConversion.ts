import type {
  ConversionDisposition,
  ConversionQuality,
  QualityIssue,
} from '../converter/contracts';

interface TextAnomalies {
  replacementCharacters: number;
  suspiciousControls: number;
  suspiciousUnicode: number;
}

interface AssessmentInput {
  bytes: Uint8Array;
  finalText: string;
  primaryText: string;
  detectedFormat?: string;
  fileName: string;
  disposition: ConversionDisposition;
  extractionSource: ConversionQuality['extractionSource'];
  pageCount?: number;
  pagesWithoutText?: number;
  usedPdfFallback?: boolean;
  encodingSuspect?: boolean;
  verificationUnavailable?: boolean;
  imageOnlyPdf?: boolean;
  mixedPdf?: boolean;
}

function containsAscii(bytes: Uint8Array, value: string): boolean {
  const needle = new TextEncoder().encode(value);
  if (needle.length === 0 || bytes.length < needle.length) {
    return false;
  }

  outer: for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) {
        continue outer;
      }
    }
    return true;
  }

  return false;
}

export function isPdfInput(fileName: string, detectedFormat?: string): boolean {
  return (
    detectedFormat === 'pdf' || fileName.toLocaleLowerCase('en-US').endsWith('.pdf')
  );
}

export function hasType0WithoutToUnicode(bytes: Uint8Array): boolean {
  return (
    (containsAscii(bytes, '/Subtype /Type0') || containsAscii(bytes, '/Type0')) &&
    !containsAscii(bytes, '/ToUnicode')
  );
}

export function inspectTextAnomalies(text: string): TextAnomalies {
  let replacementCharacters = 0;
  let suspiciousControls = 0;
  let suspiciousUnicode = 0;

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    const codePoint = text.codePointAt(index) ?? codeUnit;

    if (codePoint === 0xfffd) {
      replacementCharacters += 1;
    }
    if (
      codePoint <= 0x08 ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      suspiciousControls += 1;
    }
    if (
      codePoint === 0x00ff ||
      (codePoint >= 0x2f00 && codePoint <= 0x2fd5) ||
      (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
      (codePoint & 0xffff) === 0xfffe ||
      (codePoint & 0xffff) === 0xffff
    ) {
      suspiciousUnicode += 1;
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        suspiciousUnicode += 1;
      } else {
        index += 1;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      suspiciousUnicode += 1;
    }
  }

  return { replacementCharacters, suspiciousControls, suspiciousUnicode };
}

export function textAnomalyScore(text: string): number {
  const anomalies = inspectTextAnomalies(text);
  return (
    anomalies.replacementCharacters +
    anomalies.suspiciousControls +
    anomalies.suspiciousUnicode
  );
}

export function assessConversion({
  bytes,
  finalText,
  primaryText,
  detectedFormat,
  fileName,
  disposition,
  extractionSource,
  pageCount,
  pagesWithoutText,
  usedPdfFallback = false,
  encodingSuspect = false,
  verificationUnavailable = false,
  imageOnlyPdf = false,
  mixedPdf = false,
}: AssessmentInput): ConversionQuality {
  const issues: QualityIssue[] = [
    {
      code: 'sourceComparisonRequired',
      severity: 'warning',
      message:
        '変換結果は原本との完全一致を自動保証しません。氏名・所属・住所・メール・電話・ID を含む重要箇所を原本と照合してください。',
    },
  ];
  const outputCharacterCount = Array.from(finalText).filter(
    (character) => !/\s/u.test(character),
  ).length;
  const isPdf = isPdfInput(fileName, detectedFormat);
  const primaryAnomalies = inspectTextAnomalies(primaryText);

  if (isPdf) {
    issues.push({
      code: 'pdfOriginalComparisonRequired',
      severity: 'high',
      message:
        'PDF はフォント情報により機械可読文字が欠落する場合があります。ページ単位で原本と照合してください。画像のみ／スキャン PDF は OCR 非対応です。',
    });

    if (hasType0WithoutToUnicode(bytes)) {
      issues.push({
        code: 'pdfType0WithoutToUnicode',
        severity: 'high',
        message:
          'Type0 フォントを検出しましたが ToUnicode マップを確認できません。半角カタカナや日本語が欠落し得る構造です。',
      });
    }
  }

  if (primaryAnomalies.replacementCharacters > 0) {
    issues.push({
      code: 'replacementCharacterFound',
      severity: 'high',
      message: `anydoc 一次変換で置換文字（�）を ${primaryAnomalies.replacementCharacters.toLocaleString('ja-JP')} 件検出しました。`,
    });
  }
  if (primaryAnomalies.suspiciousControls > 0) {
    issues.push({
      code: 'suspiciousControlCharacterFound',
      severity: 'high',
      message: `anydoc 一次変換で異常制御文字を ${primaryAnomalies.suspiciousControls.toLocaleString('ja-JP')} 件検出しました。`,
    });
  }
  if (primaryAnomalies.suspiciousUnicode > 0) {
    issues.push({
      code: 'suspiciousUnicodeCharacterFound',
      severity: 'high',
      message: `anydoc 一次変換で不自然な Unicode 文字を ${primaryAnomalies.suspiciousUnicode.toLocaleString('ja-JP')} 件検出しました。`,
    });
  }
  if (bytes.byteLength > 4 * 1024 && outputCharacterCount < 20) {
    issues.push({
      code: 'suspiciouslyShortOutput',
      severity: 'high',
      message: '入力サイズに比べて抽出文字が極端に少ないため、内容欠落の可能性があります。',
    });
  }
  if (encodingSuspect) {
    issues.push({
      code: 'encoding_suspect',
      severity: 'high',
      message:
        'anydoc とブラウザ内の独立 PDF 抽出結果に文字異常または欠落差を検出しました。無警告の成功として扱いません。',
    });
  }
  if (usedPdfFallback) {
    issues.push({
      code: 'pdf_text_fallback',
      severity: 'warning',
      message:
        '文字化けを推測置換せず、異常スコアが低いブラウザ内 PDFium 抽出へ切り替えました。結果は partial です。',
    });
  }
  if (verificationUnavailable) {
    issues.push({
      code: 'pdf_verification_unavailable',
      severity: 'high',
      message: 'ブラウザ内の独立 PDF 抽出と比較できなかったため、完全性を確認できません。',
    });
  }
  if (imageOnlyPdf) {
    issues.push({
      code: 'ocr_required',
      severity: 'high',
      message: '全ページから機械可読テキストを検出できません。画像のみ／スキャン PDF は OCR 非対応です。',
    });
  }
  if (mixedPdf) {
    issues.push({
      code: 'mixed_pdf',
      severity: 'high',
      message:
        'テキストを抽出できないページが含まれます。画像ページは変換されないため、結果は partial です。',
    });
  }

  return {
    reviewRequired: true,
    disposition,
    safeToExport: disposition !== 'failed',
    extractionSource,
    outputCharacterCount,
    pageCount,
    pagesWithoutText,
    issues,
  };
}

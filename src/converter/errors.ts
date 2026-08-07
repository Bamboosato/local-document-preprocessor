import type {
  ConversionErrorCode,
  SerializedConversionError,
} from './contracts';

const KNOWN_CODES = new Set<ConversionErrorCode>([
  'unsupported',
  'malformed',
  'encrypted',
  'resourceLimit',
  'missingPart',
  'initializationFailed',
  'conversionFailed',
  'postprocessingFailed',
  'invalidSelection',
]);

export function serializeConversionError(error: unknown): SerializedConversionError {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code) as ConversionErrorCode;
    if (KNOWN_CODES.has(code)) {
      return { code };
    }
  }

  return { code: 'unknown' };
}

export function conversionErrorMessage(code: ConversionErrorCode): string {
  switch (code) {
    case 'encrypted':
      return 'パスワード付き・暗号化文書は変換できません。パスワードを解除した複製を選択してください。';
    case 'unsupported':
      return '未対応形式です。PDF の場合は、OCR が必要な画像のみ／スキャン PDF の可能性があります。';
    case 'malformed':
      return '文書が破損しているか、意味のある内容を読み取れませんでした。';
    case 'resourceLimit':
      return '安全のため変換を停止しました。展開量、ネスト、または文書要素数が上限を超えています。';
    case 'missingPart':
      return '変換に必要な文書内部のデータが欠落しています。文書を別名で保存し直してからお試しください。';
    case 'appFileTooLarge':
      return 'ファイルサイズがアプリの上限 50 MiB を超えています。';
    case 'initializationFailed':
      return 'ブラウザ内変換エンジンを初期化できませんでした。ページを再読み込みして再度お試しください。';
    case 'conversionFailed':
      return '変換エンジンが文書を処理できませんでした。形式とファイル内容を確認してください。';
    case 'postprocessingFailed':
      return '変換後の Markdown / plain text 処理を完了できませんでした。ページを再読み込みして再度お試しください。';
    case 'invalidSelection':
      return '変換範囲が文書のページ・スライド・シート構成と一致しません。範囲を選び直してください。';
    default:
      return '変換中に予期しない問題が発生しました。元のファイルを変更せず、再度お試しください。';
  }
}

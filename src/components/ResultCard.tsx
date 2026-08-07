import { useState } from 'react';
import type {
  ConversionDisposition,
  ConversionResult,
} from '../converter/contracts';
import { copyText, downloadText, outputFileName } from '../utils/files';
import { MarkdownPreview } from './MarkdownPreview';

interface ResultCardProps {
  id: string;
  fileName: string;
  result: ConversionResult;
}

type OutputKind = 'markdown' | 'plainText';

const DISPOSITION_LABELS: Record<ConversionDisposition, string> = {
  success: '変換成功（要原本照合）',
  partial: '一部変換（要原本照合）',
  failed: '変換失敗（出力利用不可）',
};

const QUALITY_HEADINGS: Record<ConversionDisposition, string> = {
  success: '原本との照合が必要です',
  partial: '警告付きの部分結果です',
  failed: '変換結果の完全性を保証できません',
};

export function ResultCard({ id, fileName, result }: ResultCardProps) {
  const [activeOutput, setActiveOutput] = useState<OutputKind>('markdown');
  const [notice, setNotice] = useState('');
  const text = activeOutput === 'markdown' ? result.markdown : result.plainText;
  const outputLabel = activeOutput === 'markdown' ? 'Markdown' : 'plain text';

  const handleCopy = async () => {
    if (!result.quality.safeToExport) return;
    try {
      await copyText(text);
      setNotice(`${outputLabel} をコピーしました。`);
    } catch {
      setNotice('コピーできませんでした。ブラウザの権限を確認してください。');
    }
  };

  const handleDownload = () => {
    if (!result.quality.safeToExport) return;
    const isMarkdown = activeOutput === 'markdown';
    downloadText(
      outputFileName(fileName, isMarkdown ? '.md' : '.txt'),
      text,
      isMarkdown ? 'text/markdown' : 'text/plain',
    );
    setNotice(`${outputLabel} のダウンロードを開始しました。`);
  };

  return (
    <article
      className={`result-card result-${result.quality.disposition}`}
      aria-labelledby={`result-${id}`}
    >
      <div className="result-heading">
        <div>
          <p className="eyebrow">{DISPOSITION_LABELS[result.quality.disposition]}</p>
          <h3 id={`result-${id}`}>{fileName}</h3>
        </div>
        <span className="format-chip">{result.detectedFormat ?? '形式不明'}</span>
      </div>

      <div className="quality-panel" role="status">
        <strong>{QUALITY_HEADINGS[result.quality.disposition]}</strong>
        <ul>
          {result.quality.issues.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              data-issue-code={issue.code}
              data-severity={issue.severity}
            >
              {issue.message}
            </li>
          ))}
        </ul>
        <small>
          抽出文字数（空白除外）:{' '}
          {result.quality.outputCharacterCount.toLocaleString('ja-JP')}
          {result.quality.pageCount !== undefined &&
            ` / PDF ${result.quality.pageCount} ページ（テキストなし ${result.quality.pagesWithoutText ?? 0}）`}
        </small>
      </div>

      {!result.quality.safeToExport ? (
        <p className="blocked-output" role="alert">
          誤った文字列の利用を防ぐため、プレビュー・コピー・ダウンロードを停止しました。
        </p>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label={`${fileName} の出力形式`}>
            <button
              type="button"
              role="tab"
              aria-selected={activeOutput === 'markdown'}
              onClick={() => setActiveOutput('markdown')}
            >
              Markdown
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeOutput === 'plainText'}
              onClick={() => setActiveOutput('plainText')}
            >
              plain text
            </button>
          </div>

          <div className="preview-shell" role="tabpanel">
            {activeOutput === 'markdown' ? (
              <MarkdownPreview markdown={result.markdown} />
            ) : (
              <pre className="plain-preview">{result.plainText}</pre>
            )}
          </div>

          <div className="result-actions">
            <button type="button" className="secondary-button" onClick={handleCopy}>
              {outputLabel} をコピー
            </button>
            <button type="button" className="secondary-button" onClick={handleDownload}>
              {outputLabel} をダウンロード
            </button>
          </div>
        </>
      )}
      <p className="operation-notice" aria-live="polite">
        {notice}
      </p>
    </article>
  );
}

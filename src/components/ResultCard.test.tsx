import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConversionDisposition, ConversionResult } from '../converter/contracts';
import { ResultCard } from './ResultCard';

function result(disposition: ConversionDisposition): ConversionResult {
  return {
    markdown: '検証結果',
    plainText: '検証結果',
    detectedFormat: 'pdf',
    quality: {
      reviewRequired: true,
      disposition,
      safeToExport: disposition !== 'failed',
      extractionSource: disposition === 'partial' ? 'pdfium_fallback' : 'anydoc',
      outputCharacterCount: 4,
      issues: [
        {
          code: disposition === 'partial' ? 'encoding_suspect' : 'sourceComparisonRequired',
          severity: disposition === 'success' ? 'warning' : 'high',
          message: '検証用の品質通知',
        },
      ],
    },
  };
}

describe('ResultCard quality state', () => {
  it('[状態遷移] partial は警告を表示しつつ両出力操作を許可する', () => {
    render(<ResultCard id="partial" fileName="partial.pdf" result={result('partial')} />);

    expect(screen.getByText('一部変換（要原本照合）')).toBeInTheDocument();
    expect(screen.getByText('警告付きの部分結果です')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Markdown をコピー' })).toBeEnabled();
  });

  it('[異常系] failed は保証不能な出力のプレビューと操作を停止する', () => {
    render(<ResultCard id="failed" fileName="failed.pdf" result={result('failed')} />);

    expect(screen.getByText('変換失敗（出力利用不可）')).toBeInTheDocument();
    expect(
      screen.getByText('誤った文字列の利用を防ぐため、プレビュー・コピー・ダウンロードを停止しました。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Markdown' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /コピー/u })).not.toBeInTheDocument();
  });
});

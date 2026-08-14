import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversionDisposition, ConversionResult } from '../converter/contracts';
import { downloadText } from '../utils/files';
import { ResultCard } from './ResultCard';

vi.mock('../utils/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/files')>()),
  downloadText: vi.fn(),
}));

const mockedDownloadText = vi.mocked(downloadText);

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
  beforeEach(() => {
    mockedDownloadText.mockReset();
  });

  it('[状態遷移] partial は警告を表示しつつ両出力操作を許可する', () => {
    render(
      <ResultCard
        id="partial"
        fileName="partial.pdf"
        originalUpdatedAt={0}
        result={result('partial')}
      />,
    );

    expect(screen.getByText('一部変換（要原本照合）')).toBeInTheDocument();
    expect(screen.getByText('警告付きの部分結果です')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Markdown をコピー' })).toBeEnabled();
  });

  it('[異常系] failed は保証不能な出力のプレビューと操作を停止する', () => {
    render(
      <ResultCard
        id="failed"
        fileName="failed.pdf"
        originalUpdatedAt={0}
        result={result('failed')}
      />,
    );

    expect(screen.getByText('変換失敗（出力利用不可）')).toBeInTheDocument();
    expect(
      screen.getByText('誤った文字列の利用を防ぐため、プレビュー・コピー・ダウンロードを停止しました。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Markdown' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /コピー/u })).not.toBeInTheDocument();
  });

  it('[正常系] Markdown ダウンロードだけに元ファイルメタデータを付与する', async () => {
    const user = userEvent.setup();
    render(
      <ResultCard
        id="markdown-download"
        fileName="元資料.pdf"
        originalUpdatedAt={0}
        result={result('success')}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Markdown をダウンロード' }));

    expect(mockedDownloadText).toHaveBeenCalledWith(
      '元資料.md',
      '---\ntitle: "元資料.pdf"\noriginal_updatedAt: "1970-01-01T00:00:00.000Z"\n---\n\n検証結果',
      'text/markdown',
    );
  });

  it('[正常系] plain text ダウンロードには frontmatter を付与しない', async () => {
    const user = userEvent.setup();
    render(
      <ResultCard
        id="plain-text-download"
        fileName="元資料.pdf"
        originalUpdatedAt={0}
        result={result('success')}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'plain text' }));
    await user.click(screen.getByRole('button', { name: 'plain text をダウンロード' }));

    expect(mockedDownloadText).toHaveBeenCalledWith('元資料.txt', '検証結果', 'text/plain');
  });
});

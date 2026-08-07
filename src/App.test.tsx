import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App initial workspace', () => {
  it('uses the LPM-aligned app title and keeps usage boundaries compact', () => {
    render(<App />);

    const title = screen.getByRole('heading', { name: 'Local Document Preprocessor' });
    const privacyBadge = screen.getByLabelText('ローカル処理・保存なし');
    expect(title).toBeInTheDocument();
    expect(title.parentElement).toHaveClass('hero-title-row');
    expect(title.parentElement).toContainElement(privacyBadge);
    expect(
      screen.getByText(
        '文書を、端末の中だけでテキストへ。ブラウザ内で完結し、外部送信やサーバー保存は行いません。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('ローカル処理・保存なし')).toBeInTheDocument();
    expect(screen.queryByText('LOCAL DOCUMENT PREPROCESSOR')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '文書を選択' })).toBeInTheDocument();
    expect(screen.getByText('ファイルをここにドロップ')).toBeInTheDocument();
    expect(screen.getByText(/外部送信・永続保存なし/)).toBeInTheDocument();
    expect(screen.getByText(/OCR非対応/)).toBeInTheDocument();
    expect(screen.getByText(/local-pii-masker へ手動でコピー／ダウンロード/)).toBeInTheDocument();

    expect(screen.queryByText('送信・保存なし')).not.toBeInTheDocument();
    expect(screen.queryByText('OCR 非対応')).not.toBeInTheDocument();
    expect(screen.queryByText('PII 処理は別アプリ')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '変換後は必ず原本と照合してください' }),
    ).not.toBeInTheDocument();
  });
});

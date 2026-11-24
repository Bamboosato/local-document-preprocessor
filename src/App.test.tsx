import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import * as pwa from './pwa/client';

describe('App initial workspace', () => {
  it('shows no offline notice while the app prepares its offline files', () => {
    const state: pwa.PwaState = { phase: 'preparing', canConvert: true };
    const getState = vi.spyOn(pwa, 'getPwaState').mockReturnValue(state);
    try {
      render(<App />);
      expect(screen.queryByLabelText('オフラインと更新の状態')).not.toBeInTheDocument();
    } finally {
      getState.mockRestore();
    }
  });

  it('uses the LPM-aligned app title and keeps usage boundaries compact', () => {
    render(<App />);

    const title = screen.getByRole('heading', { name: 'Local Document Preprocessor' });
    const privacyBadge = screen.getByLabelText('端末内で処理');
    expect(title).toBeInTheDocument();
    expect(title.parentElement).toHaveClass('hero-title-row');
    expect(title.parentElement).toContainElement(privacyBadge);
    expect(screen.getByText('文書をテキストに変換します。')).toBeInTheDocument();
    expect(screen.queryByText('LOCAL DOCUMENT PREPROCESSOR')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '文書を選択' })).toBeInTheDocument();
    expect(screen.getByText('ファイルを選択')).toBeInTheDocument();
    expect(screen.getByText('文書は外部に送信しません。結果はタブを閉じる前に保存してください。')).toBeInTheDocument();
    expect(screen.getByText('画像だけのPDFからは文字を読み取れません。')).toBeInTheDocument();
    expect(screen.queryByText(/local-pii-masker/)).not.toBeInTheDocument();

    expect(screen.queryByText('送信・保存なし')).not.toBeInTheDocument();
    expect(screen.queryByText('OCR 非対応')).not.toBeInTheDocument();
    expect(screen.queryByText('PII 処理は別アプリ')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '変換後は必ず原本と照合してください' }),
    ).not.toBeInTheDocument();
  });
});

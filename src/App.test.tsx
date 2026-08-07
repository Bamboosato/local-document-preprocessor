import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App safety boundaries', () => {
  it('shows local-only, no-OCR, PII-boundary, and source-comparison notices initially', () => {
    render(<App />);

    expect(screen.getByText('送信・保存なし')).toBeInTheDocument();
    expect(screen.getByText('OCR 非対応')).toBeInTheDocument();
    expect(screen.getByText('PII 処理は別アプリ')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '変換後は必ず原本と照合してください' }),
    ).toBeInTheDocument();
  });
});

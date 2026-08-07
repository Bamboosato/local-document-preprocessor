import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectionDialog } from './SelectionDialog';

describe('SelectionDialog', () => {
  it('PDFの有効な連続範囲だけを確定する', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SelectionDialog
        fileName="three-pages.pdf"
        inspection={{ selectionKind: 'pages', supportsSelection: true, totalUnits: 3, sheets: [] }}
        selection={{ mode: 'all' }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '範囲を指定' }));
    fireEvent.change(screen.getByLabelText('開始'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('終了'), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'この範囲に決定' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('開始'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: 'この範囲に決定' }));

    expect(onConfirm).toHaveBeenCalledWith({ mode: 'range', start: 2, end: 2 });
  });

  it('PowerPointではスライド単位の文言を表示する', () => {
    render(
      <SelectionDialog
        fileName="slides.pptx"
        inspection={{ selectionKind: 'slides', supportsSelection: true, totalUnits: 4, sheets: [] }}
        selection={{ mode: 'all' }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'すべてのスライド（4枚）' })).toBeChecked();
  });

  it('Excelの非表示シートを明示し、0件選択を拒否する', async () => {
    const user = userEvent.setup();
    render(
      <SelectionDialog
        fileName="book.xlsx"
        inspection={{
          selectionKind: 'sheets',
          supportsSelection: true,
          totalUnits: 2,
          sheets: [
            { name: '売上', index: 1, hidden: false },
            { name: '在庫', index: 2, hidden: true },
          ],
        }}
        selection={{ mode: 'all' }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '対象シートを選択' }));
    expect(screen.getByText('非表示')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '全解除' }));
    expect(screen.getByRole('button', { name: 'この範囲に決定' })).toBeDisabled();
  });

  it('DOCX等は文書全体のみと明示する', () => {
    render(
      <SelectionDialog
        fileName="document.docx"
        inspection={{ selectionKind: 'document', supportsSelection: false, sheets: [] }}
        selection={{ mode: 'all' }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('文書全体を変換します')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

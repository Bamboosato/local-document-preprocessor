import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownPreview } from './MarkdownPreview';

describe('MarkdownPreview', () => {
  it('段落内の単一改行を表示し、空行による段落分割を維持する', () => {
    const { container } = render(
      <MarkdownPreview markdown={'1行目\n2行目\n\n3行目'} />,
    );

    const paragraphs = container.querySelectorAll('.markdown-preview > p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.querySelectorAll('br')).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent(/1行目\s+2行目/u);
    expect(paragraphs[1]).toHaveTextContent('3行目');
  });

  it('[UI・境界値] 多数列になり得る表を専用の横スクロール領域に隔離する', () => {
    const { container } = render(
      <MarkdownPreview
        markdown={[
          '| 列1 | 列2 | 列3 |',
          '| --- | --- | --- |',
          '| 値1 | 値2 | 値3 |',
        ].join('\n')}
      />,
    );

    const scrollRegion = screen.getByRole('region', {
      name: '表（横にスクロールできます）',
    });
    const table = container.querySelector('table');

    expect(scrollRegion).toHaveClass('markdown-table-scroll');
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    expect(table).not.toBeNull();
    expect(scrollRegion).toContainElement(table);
  });

  it('does not create external image or link elements', () => {
    const { container } = render(
      <MarkdownPreview
        markdown={[
          '[外部資料](https://example.invalid/document)',
          '',
          '![外部画像](https://example.invalid/tracker.png)',
        ].join('\n')}
      />,
    );

    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('外部資料')).toBeInTheDocument();
    expect(screen.getByText('[画像: 外部画像]')).toBeInTheDocument();
  });

  it('skips raw HTML instead of executing it', () => {
    const { container } = render(
      <MarkdownPreview markdown={'<script>window.compromised = true</script><iframe src="https://example.invalid"></iframe>'} />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });
});

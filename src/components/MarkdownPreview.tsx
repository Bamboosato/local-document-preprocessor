import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  markdown: string;
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview" data-testid="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        components={{
          table: ({ children }) => (
            <div
              className="markdown-table-scroll"
              role="region"
              aria-label="表（横にスクロールできます）"
              tabIndex={0}
            >
              <table>{children}</table>
            </div>
          ),
          a: ({ children }) => (
            <span className="blocked-reference" title="参照先は取得しません">
              {children}
              <span className="sr-only">（参照先の取得は無効）</span>
            </span>
          ),
          img: ({ alt }) => (
            <span className="blocked-image" role="img" aria-label="外部取得しない画像">
              [画像: {alt || '代替テキストなし'}]
            </span>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

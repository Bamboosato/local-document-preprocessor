import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {createContext, memo, useContext, type ReactNode} from 'react';

const BeforeTableContext = createContext<ReactNode>(null);

function PreviewTable({ children }: { children?: ReactNode }) {
  const beforeTable = useContext(BeforeTableContext);
  return (
    <>
      {beforeTable}
      <div
        className="markdown-table-scroll"
        role="region"
        aria-label="表（横にスクロールできます）"
        tabIndex={0}
      >
        <table>{children}</table>
      </div>
    </>
  );
}

interface MarkdownPreviewProps {
  markdown: string;
  beforeTable?: ReactNode;
}

export const MarkdownPreview=memo(function MarkdownPreview({ markdown, beforeTable }: MarkdownPreviewProps) {
  return (
    <BeforeTableContext.Provider value={beforeTable}>
    <div className="markdown-preview" data-testid="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        components={{
          table: PreviewTable,
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
    </BeforeTableContext.Provider>
  );
});

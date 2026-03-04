/**
 * ENSEÑIA SMT — Markdown Renderer
 *
 * Lightweight wrapper around react-markdown with GFM support.
 * Memoized to avoid expensive re-parses during streaming when
 * sibling components re-render but this component's content hasn't changed.
 */

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

export default memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  );
});

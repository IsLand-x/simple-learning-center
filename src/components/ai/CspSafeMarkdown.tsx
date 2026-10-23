import { memo, type ComponentType } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ExpandableImage } from '../ExpandableImage';
import { MarkdownLink } from './MarkdownLink';
import { remarkReadableStrong } from './remarkReadableStrong';
import { normalizeMathMarkdown } from './normalizeMathMarkdown';

export const CspSafeMarkdown = memo(function CspSafeMarkdown({
  content,
  className = '',
  ImageComponent = ExpandableImage,
}: {
  content: string;
  className?: string;
  ImageComponent?: ComponentType<{ src?: string; alt?: string }>;
}) {
  if (!content) return null;
  return (
    <div className={`${className} csp-chat-markdown min-w-0 [max-width:100%]`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkReadableStrong]}
        rehypePlugins={[
          [rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 }],
        ]}
        components={{ img: ImageComponent, a: MarkdownLink }}
      >
        {normalizeMathMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
});

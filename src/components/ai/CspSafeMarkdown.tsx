import type { ComponentType } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExpandableImage } from '../ExpandableImage';
import { MarkdownLink } from './MarkdownLink';

export function CspSafeMarkdown({
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
        remarkPlugins={[remarkGfm]}
        components={{ img: ImageComponent, a: MarkdownLink }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

import type { ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';

export function MarkdownLink({ children, href, node }: ComponentProps<'a'> & ExtraProps) {
  return node?.children.some((child) => child.type === 'element' && child.tagName === 'img') ? (
    <>{children}</>
  ) : (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

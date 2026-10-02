import { type ReactNode } from 'react';
import { findRssSearchMatches } from '../rssSearch';

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const matches = findRssSearchMatches(text, query);
  if (!matches.length) return <>{text}</>;
  const content: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match) => {
    if (match.start > cursor) content.push(text.slice(cursor, match.start));
    content.push(
      <mark
        className="rss-search-highlight [padding:0_0.08em] [color:rgba(var(--semi-black),_0.88)] [background:var(--semi-color-highlight-bg)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
        key={`${match.start}-${match.end}`}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  });

  if (cursor < text.length) content.push(text.slice(cursor));
  return <>{content}</>;
}

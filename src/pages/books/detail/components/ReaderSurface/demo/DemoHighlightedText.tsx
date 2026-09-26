import type { HighlightItem } from '../../../../../../../contracts/reading';
import type { ReaderHighlightTarget } from '../../../../../../types/reader';
import { DemoHighlightMark } from './DemoHighlightMark';

export function DemoHighlightedText({
  text,
  highlights,
  onHighlightClick,
}: {
  text: string;
  highlights: HighlightItem[];
  onHighlightClick: (target: ReaderHighlightTarget) => void;
}) {
  const candidates = highlights
    .map((highlight) => ({ highlight, start: text.indexOf(highlight.text) }))
    .filter((match) => match.start >= 0)
    .sort((left, right) => left.start - right.start);
  const matches: typeof candidates = [];
  let acceptedEnd = 0;
  candidates.forEach((match) => {
    if (match.start < acceptedEnd) return;
    matches.push(match);
    acceptedEnd = match.start + match.highlight.text.length;
  });
  if (!matches.length) return text;

  const content: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach(({ highlight, start }) => {
    if (start > cursor) content.push(text.slice(cursor, start));
    content.push(
      <DemoHighlightMark
        key={highlight.id}
        highlight={highlight}
        onHighlightClick={onHighlightClick}
      />,
    );
    cursor = start + highlight.text.length;
  });
  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}

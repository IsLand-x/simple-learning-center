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
    .flatMap((highlight) => {
      if (highlight.kind !== 'term') return [{ highlight, start: text.indexOf(highlight.text) }];
      const matches: Array<{ highlight: HighlightItem; start: number }> = [];
      if (!highlight.text) return matches;
      let start = text.indexOf(highlight.text);
      while (start >= 0) {
        matches.push({ highlight, start });
        start = text.indexOf(highlight.text, start + highlight.text.length);
      }
      return matches;
    })
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
        key={`${highlight.id}:${start}`}
        highlight={highlight}
        onHighlightClick={onHighlightClick}
      />,
    );
    cursor = start + highlight.text.length;
  });
  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}

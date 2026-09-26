import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { IconComment } from '@douyinfe/semi-icons';
import type { HighlightItem, ReaderHighlightTarget } from '../../../../types/domain';

const COMMENT_INDICATOR_SIZE = 20;

function lastRenderedLineRect(element: HTMLElement) {
  const rects = Array.from(element.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  return (
    rects.reduce<DOMRect | undefined>((current, candidate) => {
      if (!current || candidate.top > current.top + 0.5) return candidate;
      if (Math.abs(candidate.top - current.top) > 0.5) return current;
      return candidate.right > current.right ? candidate : current;
    }, undefined) ?? element.getBoundingClientRect()
  );
}

function DemoHighlightMark({
  highlight,
  onHighlightClick,
}: {
  highlight: HighlightItem;
  onHighlightClick: (target: ReaderHighlightTarget) => void;
}) {
  const markRef = useRef<HTMLElement>(null);
  const [commentIconPosition, setCommentIconPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const syncCommentIconPosition = useCallback(() => {
    const mark = markRef.current;
    if (!mark || !highlight.comment) return;
    const bounds = mark.getBoundingClientRect();
    const lastLine = lastRenderedLineRect(mark);
    const nextPosition = {
      left: lastLine.right - bounds.left - COMMENT_INDICATOR_SIZE / 2,
      top: lastLine.top - bounds.top - COMMENT_INDICATOR_SIZE / 2,
    };
    setCommentIconPosition((current) =>
      current?.left === nextPosition.left && current.top === nextPosition.top
        ? current
        : nextPosition,
    );
  }, [highlight.comment]);

  useLayoutEffect(() => {
    syncCommentIconPosition();
    const mark = markRef.current;
    const layoutContainer = mark?.closest('article');
    if (!mark || !layoutContainer) return undefined;
    const observer = new ResizeObserver(syncCommentIconPosition);
    observer.observe(layoutContainer);
    window.addEventListener('resize', syncCommentIconPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncCommentIconPosition);
    };
  }, [syncCommentIconPosition]);

  const openHighlightActions = () => {
    const mark = markRef.current;
    if (!mark) return;
    const rect = lastRenderedLineRect(mark);
    onHighlightClick({
      highlightId: highlight.id,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  };

  return (
    <mark
      ref={markRef}
      aria-label={highlight.comment ? `${highlight.text}，有评论` : highlight.text}
      className={`reader-inline-highlight relative [padding:var(--reader-highlight-vertical-padding,_0)_0] [background:color-mix(in_srgb,_var(--reader-highlight-color)_78%,_transparent)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone] ${highlight.comment ? ' reader-inline-highlight--commented' : ''}`}
      role="button"
      tabIndex={0}
      onClick={openHighlightActions}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openHighlightActions();
      }}
    >
      {highlight.text}
      {highlight.comment && (
        <span
          className="reader-inline-highlight__comment absolute [top:-10px] [left:calc(100%_-_10px)] inline-flex [width:20px] [height:20px] justify-center [border-radius:50%] [color:var(--reader-highlight-icon-color)] [background:var(--reader-highlight-color)] [visibility:visible] pointer-events-none"
          style={commentIconPosition ?? undefined}
          aria-hidden="true"
        >
          <IconComment size="large" />
        </span>
      )}
    </mark>
  );
}

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

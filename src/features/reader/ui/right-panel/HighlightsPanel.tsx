import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, Empty, Typography } from '@douyinfe/semi-ui';
import { IconDeleteStroked } from '@douyinfe/semi-icons';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { HighlightItem } from '../../../../types';

const { Text } = Typography;

export function HighlightsPanel({
  bookId,
  focusedHighlightId,
  onJumpHighlight,
}: {
  bookId: string;
  focusedHighlightId?: string | null;
  onJumpHighlight: (highlight: HighlightItem) => void;
}) {
  const allHighlights = useLearningStore((state) => state.highlights);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const highlights = useMemo(
    () =>
      allHighlights.filter(
        (highlight) => highlight.bookId === bookId && highlight.kind !== 'comment',
      ),
    [allHighlights, bookId],
  );
  const focusedCardRef = useRef<HTMLElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    highlight: HighlightItem;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!focusedHighlightId) return;
    focusedCardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedHighlightId, highlights]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  return (
    <div className="right-panel__body highlights-panel">
      {highlights.length ? (
        highlights.map((highlight) => (
          <article
            className={`highlight-card${highlight.id === focusedHighlightId ? ' highlight-card--focused' : ''}`}
            key={highlight.id}
            ref={highlight.id === focusedHighlightId ? focusedCardRef : undefined}
            role="button"
            tabIndex={0}
            title="右键可删除高亮"
            onClick={() => onJumpHighlight(highlight)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({ highlight, x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onJumpHighlight(highlight);
              }
            }}
          >
            <p>{highlight.text}</p>
            <div className="highlight-card__footer">
              <Text size="small" type="tertiary">
                {highlight.chapter}
                {highlight.page ? ` · 第 ${highlight.page} 页` : ''}
              </Text>
            </div>
          </article>
        ))
      ) : (
        <Empty title="还没有高亮" description="选中阅读器中的文字即可添加高亮" />
      )}
      {contextMenu &&
        createPortal(
          <Dropdown
            autoAdjustOverflow
            closeOnEsc
            margin={0}
            motion={false}
            position="bottomLeft"
            rePosKey={`${contextMenu.x}:${contextMenu.y}`}
            spacing={0}
            trigger="custom"
            visible
            render={
              <Dropdown.Menu>
                <Dropdown.Item
                  type="danger"
                  icon={<IconDeleteStroked />}
                  onClick={() => {
                    const { highlight } = contextMenu;
                    setContextMenu(null);
                    deleteHighlight(highlight.id);
                  }}
                >
                  删除高亮
                </Dropdown.Item>
              </Dropdown.Menu>
            }
            onVisibleChange={(visible) => {
              if (!visible) setContextMenu(null);
            }}
          >
            <span
              aria-hidden="true"
              className="cursor-context-menu-anchor"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              tabIndex={-1}
            />
          </Dropdown>,
          document.body,
        )}
    </div>
  );
}

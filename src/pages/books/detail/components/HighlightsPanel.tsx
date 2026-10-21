import { IconDeleteStroked } from '@douyinfe/semi-icons';
import { Dropdown, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { HighlightItem } from '../../../../../contracts/reading';
import { sortAnnotations, type AnnotationSortOrder } from './annotationSorting';

const { Text } = Typography;

export function HighlightsPanel({
  bookId,
  focusedHighlightId,
  sortOrder,
  onJumpHighlight,
}: {
  bookId: string;
  focusedHighlightId?: string | null;
  sortOrder: AnnotationSortOrder;
  onJumpHighlight: (highlight: HighlightItem) => void;
}) {
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLocaleLowerCase();
  const allHighlights = useLearningStore((state) => state.highlights);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const highlights = useMemo(
    () =>
      sortAnnotations(
        allHighlights.filter(
          (highlight) =>
            highlight.bookId === bookId &&
            highlight.kind !== 'comment' &&
            highlight.kind !== 'term',
        ),
        sortOrder,
      ),
    [allHighlights, bookId, sortOrder],
  );
  const filtered = highlights.filter((item) =>
    [item.text, item.chapter, item.comment, item.definition].some((value) =>
      value?.toLocaleLowerCase().includes(keyword),
    ),
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
    <div className="right-panel__body min-h-0 highlights-panel">
      <Input
        aria-label="搜索划线"
        placeholder="搜索划线、评论或章节"
        value={query}
        onChange={setQuery}
        showClear
        className="shrink-0 [margin-bottom:8px] mobile:[&_input]:text-[16px]"
      />
      {filtered.length ? (
        filtered.map((highlight) => (
          <article
            className={`highlight-card [background:var(--semi-color-bg-0)] [padding:9px_10px] [transition:background-color_160ms_ease,_border-color_160ms_ease] ${highlight.id === focusedHighlightId ? ' highlight-card--focused' : ''}`}
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
            <div className="highlight-card__footer justify-between [margin-top:6px]">
              <Text size="small" type="tertiary">
                {highlight.chapter}
                {highlight.page ? ` · 第 ${highlight.page} 页` : ''}
              </Text>
            </div>
          </article>
        ))
      ) : (
        <Empty
          title={keyword ? '没有匹配结果' : '还没有高亮'}
          description={keyword ? '试试其他关键词，或清空搜索' : '选中阅读器中的文字即可添加高亮'}
        />
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
              className="cursor-context-menu-anchor block fixed [width:0] [height:0] pointer-events-none"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              tabIndex={-1}
            />
          </Dropdown>,
          document.body,
        )}
    </div>
  );
}

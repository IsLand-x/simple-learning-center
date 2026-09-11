import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, Empty, Toast, Typography } from '@douyinfe/semi-ui';
import { IconAlertTriangle, IconDeleteStroked } from '@douyinfe/semi-icons';
import { confirmDialog } from '../../../../lib/confirmDialog';
import { formatRelativeTime } from '../../../../lib/format';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { HighlightItem } from '../../../../types';

const { Text } = Typography;

export function CommentsPanel({
  bookId,
  onJumpHighlight,
}: {
  bookId: string;
  onJumpHighlight: (highlight: HighlightItem) => void;
}) {
  const allHighlights = useLearningStore((state) => state.highlights);
  const updateHighlight = useLearningStore((state) => state.updateHighlight);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const comments = useMemo(
    () =>
      allHighlights
        .filter((highlight) => highlight.bookId === bookId && highlight.comment?.trim())
        .sort(
          (left, right) =>
            (right.commentUpdatedAt ?? right.createdAt) - (left.commentUpdatedAt ?? left.createdAt),
        ),
    [allHighlights, bookId],
  );
  const [contextMenu, setContextMenu] = useState<{
    highlight: HighlightItem;
    x: number;
    y: number;
  } | null>(null);

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

  const confirmDeleteComment = (highlight: HighlightItem) => {
    confirmDialog({
      title: '删除这条评论？',
      content:
        highlight.kind === 'comment'
          ? '只会删除保存在服务器数据目录中的评论和对应正文标记。'
          : '只会删除保存在服务器数据目录中的评论，正文高亮仍会保留。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        if (highlight.kind === 'comment') deleteHighlight(highlight.id);
        else updateHighlight(highlight.id, { comment: '' });
        Toast.success('评论已删除');
      },
    });
  };

  return (
    <div className="right-panel__body comments-panel">
      {comments.length ? (
        comments.map((highlight) => (
          <article
            className="comment-card"
            key={highlight.id}
            role="button"
            tabIndex={0}
            title="右键可删除评论"
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
            <blockquote>{highlight.text}</blockquote>
            <p>{highlight.comment}</p>
            <div className="comment-card__footer">
              <Text size="small" type="tertiary">
                {highlight.chapter}
                {highlight.page ? ` · 第 ${highlight.page} 页` : ''}
              </Text>
              <Text size="small" type="tertiary">
                {formatRelativeTime(highlight.commentUpdatedAt ?? highlight.createdAt)}
              </Text>
            </div>
          </article>
        ))
      ) : (
        <Empty title="还没有评论" description="点击正文中的高亮，即可写下自己的见解" />
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
                    confirmDeleteComment(highlight);
                  }}
                >
                  删除评论
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

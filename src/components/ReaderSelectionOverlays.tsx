import { Button, ButtonGroup, TextArea, Tooltip } from '@douyinfe/semi-ui';
import { IconAIStrokedLevel1, IconBookmark, IconComment, IconDeleteStroked } from '@douyinfe/semi-icons';
import { clamp } from '../lib/format';
import type { HighlightItem, ReaderHighlightTarget, ReaderSelection } from '../types';

interface ReaderSelectionOverlaysProps {
  activeHighlight?: HighlightItem;
  activeHighlightTarget: ReaderHighlightTarget | null;
  commentDraft: string;
  commentingHighlightId: string | null;
  pendingCommentSelection: ReaderSelection | null;
  selection: ReaderSelection | null;
  onAskAboutSelection: () => void;
  onCancelCommentEditing: () => void;
  onCancelHighlight: () => void;
  onChangeCommentDraft: (value: string) => void;
  onCreateComment: () => void;
  onEditHighlightComment: () => void;
  onSaveHighlight: () => void;
  onSaveHighlightComment: () => void;
  onViewHighlight: () => void;
}

export function ReaderSelectionOverlays({
  activeHighlight,
  activeHighlightTarget,
  commentDraft,
  commentingHighlightId,
  pendingCommentSelection,
  selection,
  onAskAboutSelection,
  onCancelCommentEditing,
  onCancelHighlight,
  onChangeCommentDraft,
  onCreateComment,
  onEditHighlightComment,
  onSaveHighlight,
  onSaveHighlightComment,
  onViewHighlight,
}: ReaderSelectionOverlaysProps) {
  const commentTargetRect = pendingCommentSelection?.rect ?? activeHighlightTarget?.rect;

  return (
    <>
      {selection && (
        <div
          className={`selection-toolbar${selection.rect.top < 150 ? ' selection-toolbar--below' : ''}`}
          role="toolbar"
          aria-label="文本选择操作"
          onMouseDown={(event) => event.preventDefault()}
          style={{
            left: clamp(selection.rect.left + selection.rect.width / 2, 120, window.innerWidth - 120),
            top: selection.rect.top < 150
              ? selection.rect.top + selection.rect.height + 8
              : selection.rect.top - 8,
          }}
        >
          <ButtonGroup
            aria-label="文本选择操作"
            className="selection-toolbar__button-group"
            size="small"
            theme="borderless"
            type="tertiary"
          >
            <Button icon={<IconAIStrokedLevel1 />} onClick={onAskAboutSelection}>提问</Button>
            <Button icon={<IconBookmark />} onClick={onSaveHighlight}>高亮</Button>
            <Button icon={<IconComment />} onClick={onCreateComment}>评论</Button>
          </ButtonGroup>
        </div>
      )}

      {(pendingCommentSelection || (
        activeHighlightTarget
        && activeHighlight
        && commentingHighlightId === activeHighlight.id
      )) && commentTargetRect && (
        <form
          className={`highlight-comment-editor${commentTargetRect.top < 210 ? ' highlight-comment-editor--below' : ''}`}
          aria-label={`评论高亮：${pendingCommentSelection?.text ?? activeHighlight?.text ?? ''}`}
          style={{
            left: clamp(
              commentTargetRect.left + commentTargetRect.width / 2,
              166,
              window.innerWidth - 166,
            ),
            top: commentTargetRect.top < 210
              ? commentTargetRect.top + commentTargetRect.height + 8
              : commentTargetRect.top - 8,
          }}
          onSubmit={(event) => {
            event.preventDefault();
            onSaveHighlightComment();
          }}
        >
          <TextArea
            autoFocus
            autosize={{ minRows: 3, maxRows: 6 }}
            maxCount={1000}
            placeholder="写下你对这段内容的见解…"
            value={commentDraft}
            onChange={onChangeCommentDraft}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelCommentEditing();
              } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onSaveHighlightComment();
              }
            }}
          />
          <div className="highlight-comment-editor__actions">
            <Button size="small" theme="borderless" type="tertiary" onClick={onCancelCommentEditing}>
              取消
            </Button>
            <Tooltip content="Cmd + Enter 可以保存" position="topRight">
              <span>
                <Button
                  disabled={!commentDraft.trim() && !(activeHighlight?.comment && !pendingCommentSelection)}
                  htmlType="submit"
                  size="small"
                  theme="solid"
                  type="primary"
                >
                  保存
                </Button>
              </span>
            </Tooltip>
          </div>
        </form>
      )}

      {activeHighlightTarget && activeHighlight && commentingHighlightId !== activeHighlight.id && (
        <div
          className={`selection-toolbar${activeHighlightTarget.rect.top < 150 ? ' selection-toolbar--below' : ''}`}
          role="toolbar"
          aria-label="已高亮内容操作"
          style={{
            left: clamp(
              activeHighlightTarget.rect.left + activeHighlightTarget.rect.width / 2,
              170,
              window.innerWidth - 170,
            ),
            top: activeHighlightTarget.rect.top < 150
              ? activeHighlightTarget.rect.top + activeHighlightTarget.rect.height + 8
              : activeHighlightTarget.rect.top - 8,
          }}
        >
          <ButtonGroup
            aria-label="已高亮内容操作"
            className="selection-toolbar__button-group"
            size="small"
            theme="borderless"
            type="tertiary"
          >
            <Button icon={<IconDeleteStroked />} onClick={onCancelHighlight}>取消高亮</Button>
            {activeHighlight.kind !== 'comment' && (
              <Button icon={<IconBookmark />} onClick={onViewHighlight}>在高亮中查看</Button>
            )}
            <Button icon={<IconComment />} onClick={onEditHighlightComment}>
              {activeHighlight.comment ? '查看评论' : '评论'}
            </Button>
          </ButtonGroup>
        </div>
      )}
    </>
  );
}

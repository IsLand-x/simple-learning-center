import { Button, TextArea, Tooltip } from '@douyinfe/semi-ui';
import type { HighlightItem } from '../../../contracts/reading';
import type { ReaderSelection } from '../../types/reader';
import { clamp } from '../../util/format';
import type { VisualViewportBounds } from './useOverlayViewport';
type SelectionAnnotation = Pick<HighlightItem, 'id' | 'kind' | 'text' | 'comment'>;
export function HighlightCommentEditor({
  visualViewport,
  activeHighlight,
  commentTargetRect,
  pendingCommentSelection,
  commentDraft,
  onSaveHighlightComment,
  onCancelCommentEditing,
  onChangeCommentDraft,
}: {
  visualViewport: VisualViewportBounds;
  activeHighlight?: SelectionAnnotation;
  commentTargetRect: ReaderSelection['rect'];
  pendingCommentSelection: ReaderSelection | null;
  commentDraft: string;
  onSaveHighlightComment: () => void;
  onCancelCommentEditing: () => void;
  onChangeCommentDraft: (value: string) => void;
}) {
  const keyboardVisible = visualViewport.height < window.innerHeight - 120;

  return (
    <form
      className={`highlight-comment-editor fixed [z-index:31] [width:min(320px,_calc(100vw_-_24px))] [padding:10px] [background:var(--semi-color-bg-2)] [box-shadow:var(--semi-shadow-elevated)] [transform:translate(-50%,_-100%)] mobile:[width:min(360px,_calc(100vw_-_16px))] ${!keyboardVisible && commentTargetRect.top < 210 ? ' highlight-comment-editor--below' : ''}`}
      aria-label={`评论高亮：${pendingCommentSelection?.text ?? activeHighlight?.text ?? ''}`}
      style={{
        left: keyboardVisible
          ? visualViewport.offsetLeft + visualViewport.width / 2
          : clamp(
              commentTargetRect.left + commentTargetRect.width / 2,
              166,
              window.innerWidth - 166,
            ),
        top: keyboardVisible
          ? visualViewport.offsetTop + visualViewport.height - 8
          : commentTargetRect.top < 210
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
      <div className="highlight-comment-editor__actions justify-end [gap:4px]">
        <Button size="small" theme="borderless" type="tertiary" onClick={onCancelCommentEditing}>
          取消
        </Button>
        <Tooltip content="Cmd + Enter 可以保存" position="topRight">
          <span>
            <Button
              disabled={
                !commentDraft.trim() && !(activeHighlight?.comment && !pendingCommentSelection)
              }
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
  );
}

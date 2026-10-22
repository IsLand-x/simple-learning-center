import { IconHandle } from '@douyinfe/semi-icons';
import { Button, TextArea, Tooltip } from '@douyinfe/semi-ui';
import type { HighlightItem } from '../../../contracts/reading';
import type { ReaderSelection } from '../../types/reader';
import { useCommentEditorDrag } from './useCommentEditorDrag';
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
  const { formRef, position, dragging, handleProps } = useCommentEditorDrag(
    visualViewport,
    commentTargetRect,
  );

  return (
    <form
      ref={formRef}
      className="highlight-comment-editor fixed overflow-auto [z-index:31] [width:min(320px,_calc(100vw_-_24px))] [padding:10px_10px_10px_28px] [background:var(--semi-color-bg-2)] [box-shadow:var(--semi-shadow-elevated)] mobile:[width:min(360px,_calc(100vw_-_16px))]"
      aria-label={`评论高亮：${pendingCommentSelection?.text ?? activeHighlight?.text ?? ''}`}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        maxWidth: Math.max(0, visualViewport.width - 16),
        maxHeight: Math.max(0, visualViewport.height - 16),
      }}
      onSubmit={(event) => {
        event.preventDefault();
        onSaveHighlightComment();
      }}
    >
      <Tooltip
        content="拖动调整位置；方向键移动，Enter 返回输入"
        position="topLeft"
        rePosKey={`${position?.left}:${position?.top}`}
        condition={!dragging}
      >
        <span
          {...handleProps}
          role="button"
          tabIndex={0}
          aria-label="拖动评论输入框"
          className={`highlight-comment-editor__handle absolute inline-flex items-center justify-center [width:16px] [height:16px] [left:6px] [top:14px] [color:var(--semi-color-text-2)] hover:[color:var(--semi-color-text-1)] touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <IconHandle />
        </span>
      </Tooltip>
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

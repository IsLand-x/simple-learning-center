import { useOverlayViewport } from './useOverlayViewport';
import type { HighlightItem } from '../../../contracts/reading';
import type { ReaderHighlightTarget, ReaderSelection } from '../../types/reader';
import { SelectionToolbar } from './SelectionToolbar';
import { HighlightToolbar } from './HighlightToolbar';
import { HighlightCommentEditor } from './HighlightCommentEditor';
type SelectionAnnotation = Pick<HighlightItem, 'id' | 'kind' | 'text' | 'comment'>;

interface ReaderSelectionOverlaysProps {
  activeHighlight?: SelectionAnnotation;
  activeHighlightTarget: ReaderHighlightTarget | null;
  commentDraft: string;
  commentingHighlightId: string | null;
  pendingCommentSelection: ReaderSelection | null;
  selection: ReaderSelection | null;
  onAskAboutHighlight?: () => void;
  onAskAboutSelection: () => void;
  onCancelCommentEditing: () => void;
  onCancelHighlight: () => void;
  onChangeCommentDraft: (value: string) => void;
  onCreateComment: () => void;
  onEditHighlightComment: () => void;
  onSaveHighlight: () => void;
  onSaveHighlightComment: () => void;
  onViewHighlight: () => void;
  showViewHighlight?: boolean;
}

export function ReaderSelectionOverlays({
  activeHighlight,
  activeHighlightTarget,
  commentDraft,
  commentingHighlightId,
  pendingCommentSelection,
  selection,
  onAskAboutHighlight,
  onAskAboutSelection,
  onCancelCommentEditing,
  onCancelHighlight,
  onChangeCommentDraft,
  onCreateComment,
  onEditHighlightComment,
  onSaveHighlight,
  onSaveHighlightComment,
  onViewHighlight,
  showViewHighlight = true,
}: ReaderSelectionOverlaysProps) {
  const visualViewport = useOverlayViewport();
  const commentTargetRect = pendingCommentSelection?.rect ?? activeHighlightTarget?.rect;
  return (
    <>
      {selection && (
        <SelectionToolbar
          selection={selection}
          onAskAboutSelection={onAskAboutSelection}
          onSaveHighlight={onSaveHighlight}
          onCreateComment={onCreateComment}
        />
      )}
      {(pendingCommentSelection ||
        (activeHighlightTarget &&
          activeHighlight &&
          commentingHighlightId === activeHighlight.id)) &&
        commentTargetRect && (
          <HighlightCommentEditor
            visualViewport={visualViewport}
            activeHighlight={activeHighlight}
            commentTargetRect={commentTargetRect}
            pendingCommentSelection={pendingCommentSelection}
            commentDraft={commentDraft}
            onSaveHighlightComment={onSaveHighlightComment}
            onCancelCommentEditing={onCancelCommentEditing}
            onChangeCommentDraft={onChangeCommentDraft}
          />
        )}
      {activeHighlightTarget && activeHighlight && commentingHighlightId !== activeHighlight.id && (
        <HighlightToolbar
          activeHighlight={activeHighlight}
          activeHighlightTarget={activeHighlightTarget}
          onAskAboutHighlight={onAskAboutHighlight}
          onCancelHighlight={onCancelHighlight}
          showViewHighlight={showViewHighlight}
          onViewHighlight={onViewHighlight}
          onEditHighlightComment={onEditHighlightComment}
        />
      )}
    </>
  );
}

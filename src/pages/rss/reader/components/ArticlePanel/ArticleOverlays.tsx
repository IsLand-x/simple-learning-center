import { ReaderSelectionOverlays } from '../../../../../components/reading/ReaderSelectionOverlays';
import { useWorkspace } from '../../store/WorkspaceContext';
import { RssImageViewer } from './RssImageViewer';

export function ArticleOverlays() {
  const { article } = useWorkspace();

  return (
    <>
      <RssImageViewer image={article.imageViewer} onClose={() => article.setImageViewer(null)} />

      <ReaderSelectionOverlays
        activeHighlight={article.activeAnnotation}
        activeHighlightTarget={article.activeAnnotationTarget}
        commentDraft={article.commentDraft}
        commentingHighlightId={article.commentingAnnotationId}
        pendingCommentSelection={article.pendingCommentSelection}
        selection={article.rssSelection}
        showViewHighlight={false}
        onAskAboutSelection={article.askAboutRssSelection}
        onCancelCommentEditing={article.cancelCommentEditing}
        onCancelHighlight={article.deleteActiveAnnotation}
        onChangeCommentDraft={article.setCommentDraft}
        onCreateComment={article.createRssComment}
        onEditHighlightComment={article.editAnnotationComment}
        onSaveHighlight={article.saveRssHighlight}
        onSaveHighlightComment={article.saveRssComment}
        onViewHighlight={() => undefined}
      />
    </>
  );
}

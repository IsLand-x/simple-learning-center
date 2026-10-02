import type { BookItem } from '../../../../../contracts/books';
import type { HighlightItem } from '../../../../../contracts/reading';
import type { ReaderSelection } from '../../../../types/reader';

const PENDING_COMMENT_HIGHLIGHT_ID = 'pending-comment-highlight';

export function createPendingCommentHighlight(
  book: BookItem,
  selection: ReaderSelection,
  chapter: string,
): HighlightItem {
  return {
    id: PENDING_COMMENT_HIGHLIGHT_ID,
    bookId: book.id,
    kind: 'comment',
    text: selection.text,
    cfi: selection.cfi,
    chapter,
    page: book.currentPage,
    createdAt: 0,
    updatedAt: 0,
  };
}

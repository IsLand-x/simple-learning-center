import type { BookItem, HighlightItem, ReaderSelection } from '../../../types';

const PENDING_COMMENT_HIGHLIGHT_ID = 'pending-comment-highlight';

export function formatPageProgress(book: BookItem) {
  const totalPages =
    typeof book.totalPages === 'number' && Number.isFinite(book.totalPages)
      ? Math.max(1, Math.round(book.totalPages))
      : null;
  if (totalPages === null) return '页数计算中';

  const savedPage =
    typeof book.currentPage === 'number' && Number.isFinite(book.currentPage)
      ? Math.round(book.currentPage)
      : Math.round((totalPages * book.progress) / 100);
  const currentPage = Math.min(totalPages, Math.max(1, savedPage));
  return `第 ${currentPage} 页 / 共 ${totalPages} 页`;
}

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

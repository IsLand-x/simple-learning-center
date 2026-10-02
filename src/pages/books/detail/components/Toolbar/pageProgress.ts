import type { BookItem } from '../../../../../../contracts/books';

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

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { BookItem, BookList } from '../../../../../contracts/books';
import type { LibraryBookContextMenuState } from '../components/BookLists/LibraryBookContextMenu';
import { confirmMoveBookToTrash } from '../../../../util/confirmBookTrash';
import { createUuid } from '../../../../util/uuid';
import {
  filterLibraryBooks,
  sortBooksByShelfOrder,
  type LibraryFilter,
  type LibrarySection,
} from './libraryView';

export function useLibraryState() {
  const navigate = useNavigate();
  const books = useLearningStore((state) => state.books);
  const bookLists = useLearningStore((state) => state.bookLists);
  const trashedBooks = useLearningStore((state) => state.trashedBooks);
  const createBookList = useLearningStore((state) => state.createBookList);
  const setBookPinned = useLearningStore((state) => state.setBookPinned);
  const setBookListBooks = useLearningStore((state) => state.setBookListBooks);
  const trashBook = useLearningStore((state) => state.trashBook);
  const [createForBookId, setCreateForBookId] = useState<string | null>(null);
  const [bookContextMenu, setBookContextMenu] = useState<LibraryBookContextMenuState | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [section, setSection] = useState<LibrarySection>('shelf');
  const [createVisible, setCreateVisible] = useState(false);

  const sortedBooks = useMemo(() => sortBooksByShelfOrder(books), [books]);
  const filteredBooks = useMemo(
    () => filterLibraryBooks(sortedBooks, filter, query),
    [filter, query, sortedBooks],
  );

  const pinnedBooks = useMemo(
    () => filteredBooks.filter((book) => Boolean(book.pinnedAt)),
    [filteredBooks],
  );
  const unpinnedBooks = useMemo(
    () => filteredBooks.filter((book) => !book.pinnedAt),
    [filteredBooks],
  );
  const bookListsByBookId = useMemo(() => {
    const listsByBookId = new Map<string, BookList[]>();
    bookLists.forEach((bookList) => {
      bookList.bookIds.forEach((bookId) => {
        const assignedLists = listsByBookId.get(bookId) ?? [];
        assignedLists.push(bookList);
        listsByBookId.set(bookId, assignedLists);
      });
    });
    return listsByBookId;
  }, [bookLists]);

  const openBook = (bookId: string) => navigate(`/books/${bookId}`);
  const closeBookContextMenu = useCallback(() => setBookContextMenu(null), []);
  const openCreateBookList = (bookId: string | null = null) => {
    setCreateForBookId(bookId);
    setCreateVisible(true);
  };
  const toggleBookList = (book: BookItem, bookList: BookList) => {
    const nextBookIds = bookList.bookIds.includes(book.id)
      ? bookList.bookIds.filter((bookId) => bookId !== book.id)
      : [...bookList.bookIds, book.id];
    setBookListBooks(bookList.id, nextBookIds);
  };
  const deleteBook = (book: BookItem) => {
    confirmMoveBookToTrash(book, (trashedBook) => {
      trashBook(book.id, trashedBook.deletedAt);
    });
  };
  const saveBookList = ({ name, note }: { name: string; note: string }) => {
    const timestamp = Date.now();
    createBookList({
      id: createUuid(),
      name,
      note,
      bookIds:
        createForBookId && books.some((book) => book.id === createForBookId)
          ? [createForBookId]
          : [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setCreateVisible(false);
    setCreateForBookId(null);
  };
  return {
    pinnedBooks,
    unpinnedBooks,
    bookListsByBookId,
    bookContextMenu,
    setBookContextMenu,
    closeBookContextMenu,
    openCreateBookList,
    toggleBookList,
    deleteBook,
    setBookPinned,
    cancelCreateBookList: () => {
      setCreateVisible(false);
      setCreateForBookId(null);
    },
    books,
    bookLists,
    trashedBooks,
    section,
    setSection,
    query,
    setQuery,
    filter,
    setFilter,
    setCreateVisible,
    filteredBooks,
    openBook,
    sortedBooks,
    createVisible,
    saveBookList,
  };
}

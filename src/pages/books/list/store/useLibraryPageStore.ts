import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import { createUuid } from '../../../../util/uuid';
import {
  filterLibraryBooks,
  sortBooksByUpdatedAt,
  type LibraryFilter,
  type LibrarySection,
} from './model/libraryView';

export function useLibraryPageStore() {
  const navigate = useNavigate();
  const books = useLearningStore((state) => state.books);
  const bookLists = useLearningStore((state) => state.bookLists);
  const trashedBooks = useLearningStore((state) => state.trashedBooks);
  const createBookList = useLearningStore((state) => state.createBookList);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [section, setSection] = useState<LibrarySection>('shelf');
  const [createVisible, setCreateVisible] = useState(false);

  const sortedBooks = useMemo(() => sortBooksByUpdatedAt(books), [books]);
  const filteredBooks = useMemo(
    () => filterLibraryBooks(sortedBooks, filter, query),
    [filter, query, sortedBooks],
  );

  const openBook = (bookId: string) => navigate(`/books/${bookId}`);
  const saveBookList = ({ name, note }: { name: string; note: string }) => {
    const timestamp = Date.now();
    createBookList({
      id: createUuid(),
      name,
      note,
      bookIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setCreateVisible(false);
  };
  return {
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

import type { LearningState, LearningStoreSet } from '../learningState';

type LibraryActions = Pick<
  LearningState,
  | 'addBooks'
  | 'setBookCovers'
  | 'updateBook'
  | 'trashBook'
  | 'restoreBook'
  | 'deleteBookPermanently'
  | 'createBookList'
  | 'updateBookList'
  | 'deleteBookList'
  | 'setBookListBooks'
  | 'moveBookInList'
  | 'removeBookFromList'
>;

export function createLibraryActions(set: LearningStoreSet): LibraryActions {
  return {
    addBooks: (books) =>
      set((state) => ({
        books: [
          ...books,
          ...state.books.filter((book) => !books.some((next) => next.id === book.id)),
        ],
      })),
    setBookCovers: (covers) =>
      set((state) => ({
        books: state.books.map((book) =>
          Object.hasOwn(covers, book.id) ? { ...book, coverDataUrl: covers[book.id] } : book,
        ),
      })),
    updateBook: (bookId, changes) =>
      set((state) => ({
        books: state.books.map((book) =>
          book.id === bookId
            ? { ...book, ...changes, updatedAt: changes.updatedAt ?? Date.now() }
            : book,
        ),
      })),
    trashBook: (bookId, deletedAt = Date.now()) =>
      set((state) => {
        const book = state.books.find((item) => item.id === bookId);
        if (!book || state.trashedBooks.some((item) => item.book.id === bookId)) return state;
        const bookListPositions = state.bookLists.flatMap((bookList) => {
          const index = bookList.bookIds.indexOf(bookId);
          return index >= 0 ? [{ bookListId: bookList.id, index }] : [];
        });
        return {
          books: state.books.filter((item) => item.id !== bookId),
          trashedBooks: [
            { book, deletedAt, bookListPositions },
            ...state.trashedBooks.filter((item) => item.book.id !== bookId),
          ],
          deletedBookTombstones: state.deletedBookTombstones.filter(
            (item) => item.bookId !== bookId,
          ),
          bookLists: state.bookLists.map((bookList) =>
            bookList.bookIds.includes(bookId)
              ? {
                  ...bookList,
                  bookIds: bookList.bookIds.filter((item) => item !== bookId),
                  updatedAt: deletedAt,
                }
              : bookList,
          ),
        };
      }),
    restoreBook: (bookId, restoredAt = Date.now()) =>
      set((state) => {
        const trashedBook = state.trashedBooks.find((item) => item.book.id === bookId);
        if (!trashedBook) return state;
        const positions = new Map(
          trashedBook.bookListPositions.map((position) => [position.bookListId, position.index]),
        );
        return {
          books: state.books.some((book) => book.id === bookId)
            ? state.books
            : [trashedBook.book, ...state.books],
          trashedBooks: state.trashedBooks.filter((item) => item.book.id !== bookId),
          deletedBookTombstones: state.deletedBookTombstones.filter(
            (item) => item.bookId !== bookId,
          ),
          bookLists: state.bookLists.map((bookList) => {
            const savedIndex = positions.get(bookList.id);
            if (!Number.isInteger(savedIndex) || bookList.bookIds.includes(bookId)) return bookList;
            const bookIds = [...bookList.bookIds];
            bookIds.splice(Math.min(Math.max(savedIndex!, 0), bookIds.length), 0, bookId);
            return { ...bookList, bookIds, updatedAt: restoredAt };
          }),
        };
      }),
    deleteBookPermanently: (bookId, deletedAt = Date.now()) =>
      set((state) => ({
        books: state.books.filter((book) => book.id !== bookId),
        trashedBooks: state.trashedBooks.filter((item) => item.book.id !== bookId),
        deletedBookTombstones: [
          { bookId, deletedAt },
          ...state.deletedBookTombstones.filter((item) => item.bookId !== bookId),
        ],
        bookLists: state.bookLists.map((bookList) =>
          bookList.bookIds.includes(bookId)
            ? {
                ...bookList,
                bookIds: bookList.bookIds.filter((item) => item !== bookId),
                updatedAt: deletedAt,
              }
            : bookList,
        ),
        highlights: state.highlights.filter((highlight) => highlight.bookId !== bookId),
        deletedHighlightTombstones: state.deletedHighlightTombstones.filter(
          (tombstone) => tombstone.bookId !== bookId,
        ),
        notes: state.notes.filter((note) => note.bookId !== bookId),
        chats: state.chats.filter((message) => message.bookId !== bookId),
        chatSessions: state.chatSessions.filter((session) => session.bookId !== bookId),
        readingSessions: state.readingSessions.filter((session) => session.bookId !== bookId),
      })),
    createBookList: (bookList) =>
      set((state) => ({
        bookLists: [bookList, ...state.bookLists.filter((item) => item.id !== bookList.id)],
      })),
    updateBookList: (bookListId, changes) =>
      set((state) => ({
        bookLists: state.bookLists.map((bookList) =>
          bookList.id === bookListId
            ? { ...bookList, ...changes, updatedAt: Date.now() }
            : bookList,
        ),
      })),
    deleteBookList: (bookListId) =>
      set((state) => ({
        bookLists: state.bookLists.filter((bookList) => bookList.id !== bookListId),
      })),
    setBookListBooks: (bookListId, bookIds) =>
      set((state) => {
        const availableBookIds = new Set(state.books.map((book) => book.id));
        const uniqueBookIds = [...new Set(bookIds)].filter((bookId) =>
          availableBookIds.has(bookId),
        );
        return {
          bookLists: state.bookLists.map((bookList) =>
            bookList.id === bookListId
              ? { ...bookList, bookIds: uniqueBookIds, updatedAt: Date.now() }
              : bookList,
          ),
        };
      }),
    moveBookInList: (bookListId, sourceIndex, destinationIndex) =>
      set((state) => ({
        bookLists: state.bookLists.map((bookList) => {
          if (
            bookList.id !== bookListId ||
            sourceIndex === destinationIndex ||
            sourceIndex < 0 ||
            destinationIndex < 0 ||
            sourceIndex >= bookList.bookIds.length ||
            destinationIndex >= bookList.bookIds.length
          )
            return bookList;
          const bookIds = [...bookList.bookIds];
          const [bookId] = bookIds.splice(sourceIndex, 1);
          bookIds.splice(destinationIndex, 0, bookId);
          return { ...bookList, bookIds, updatedAt: Date.now() };
        }),
      })),
    removeBookFromList: (bookListId, bookId) =>
      set((state) => ({
        bookLists: state.bookLists.map((bookList) =>
          bookList.id === bookListId && bookList.bookIds.includes(bookId)
            ? {
                ...bookList,
                bookIds: bookList.bookIds.filter((item) => item !== bookId),
                updatedAt: Date.now(),
              }
            : bookList,
        ),
      })),
  };
}

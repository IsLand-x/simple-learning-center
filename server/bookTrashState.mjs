export const BOOK_TRASH_STATE_VERSION = 25;
export const BOOK_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

function stateArray(state, key) {
  return Array.isArray(state?.[key]) ? state[key] : [];
}

function entryBookId(entry) {
  return typeof entry?.book?.id === 'string' ? entry.book.id : '';
}

function bookUpdatedAt(book) {
  return Number.isFinite(book?.updatedAt) ? book.updatedAt : 0;
}

function bumpStateVersion(persistedState) {
  persistedState.version = Math.max(
    Number.isInteger(persistedState.version) ? persistedState.version : 0,
    BOOK_TRASH_STATE_VERSION,
  );
}

export function protectBookTrashStateFromClient(persistedState, currentPersistedState) {
  if (!persistedState?.state || !currentPersistedState?.state) return persistedState;
  const incomingVersion = Number.isInteger(persistedState.version) ? persistedState.version : 0;
  const currentVersion = Number.isInteger(currentPersistedState.version) ? currentPersistedState.version : 0;
  if (incomingVersion < BOOK_TRASH_STATE_VERSION && currentVersion < BOOK_TRASH_STATE_VERSION) {
    return persistedState;
  }

  const protectedState = structuredClone(persistedState);
  const incomingBooks = stateArray(protectedState.state, 'books');
  const currentBooks = stateArray(currentPersistedState.state, 'books');
  const currentTrashedBooks = stateArray(currentPersistedState.state, 'trashedBooks');
  const currentTombstones = stateArray(currentPersistedState.state, 'deletedBookTombstones');
  // Browser persistence submits a full snapshot. Treat the server's trash and
  // tombstones as authoritative so an older device cannot resurrect a book;
  // only the dedicated trash/restore/delete endpoints may change this lifecycle.
  const unavailableBookIds = new Set([
    ...currentTrashedBooks.map(entryBookId),
    ...currentTombstones.map((entry) => entry?.bookId),
  ].filter(Boolean));
  const mergedBooks = new Map();

  for (const book of currentBooks) {
    if (typeof book?.id === 'string' && !unavailableBookIds.has(book.id)) mergedBooks.set(book.id, book);
  }
  for (const book of incomingBooks) {
    if (typeof book?.id !== 'string' || unavailableBookIds.has(book.id)) continue;
    const currentBook = mergedBooks.get(book.id);
    if (!currentBook || bookUpdatedAt(book) >= bookUpdatedAt(currentBook)) mergedBooks.set(book.id, book);
  }

  const incomingOrder = incomingBooks.map((book) => book?.id).filter((bookId) => mergedBooks.has(bookId));
  const incomingBookIds = new Set(incomingOrder);
  protectedState.state.books = [
    ...incomingOrder.map((bookId) => mergedBooks.get(bookId)),
    ...currentBooks
      .filter((book) => mergedBooks.has(book?.id) && !incomingBookIds.has(book.id))
      .map((book) => mergedBooks.get(book.id)),
  ];
  protectedState.state.trashedBooks = structuredClone(currentTrashedBooks);
  protectedState.state.deletedBookTombstones = structuredClone(currentTombstones);

  const trashedBookIds = new Set(currentTrashedBooks.map(entryBookId).filter(Boolean));
  const permanentlyDeletedBookIds = new Set(currentTombstones.map((entry) => entry?.bookId).filter(Boolean));
  for (const key of ['highlights', 'notes', 'chats', 'chatSessions', 'readingSessions']) {
    const currentTrashedItems = stateArray(currentPersistedState.state, key)
      .filter((item) => trashedBookIds.has(item?.bookId));
    protectedState.state[key] = [
      ...structuredClone(currentTrashedItems),
      ...stateArray(protectedState.state, key).filter((item) => (
        !trashedBookIds.has(item?.bookId) && !permanentlyDeletedBookIds.has(item?.bookId)
      )),
    ];
  }

  const activeBookIds = new Set(protectedState.state.books.map((book) => book.id));
  protectedState.state.bookLists = stateArray(protectedState.state, 'bookLists').map((bookList) => ({
    ...bookList,
    bookIds: stateArray(bookList, 'bookIds').filter((bookId) => activeBookIds.has(bookId)),
  }));
  protectedState.version = Math.max(incomingVersion, currentVersion, BOOK_TRASH_STATE_VERSION);
  return protectedState;
}

export function moveBookToTrashInState(persistedState, bookId, deletedAt = Date.now()) {
  const state = persistedState?.state;
  if (!state) return null;
  const existing = stateArray(state, 'trashedBooks').find((entry) => entryBookId(entry) === bookId);
  if (existing) return existing;
  const book = stateArray(state, 'books').find((item) => item?.id === bookId);
  if (!book) return null;

  const bookListPositions = stateArray(state, 'bookLists').flatMap((bookList) => {
    const index = stateArray(bookList, 'bookIds').indexOf(bookId);
    return index >= 0 ? [{ bookListId: bookList.id, index }] : [];
  });
  const trashedBook = { book, deletedAt, bookListPositions };
  state.books = stateArray(state, 'books').filter((item) => item?.id !== bookId);
  state.trashedBooks = [
    trashedBook,
    ...stateArray(state, 'trashedBooks').filter((entry) => entryBookId(entry) !== bookId),
  ];
  state.bookLists = stateArray(state, 'bookLists').map((bookList) => {
    if (!stateArray(bookList, 'bookIds').includes(bookId)) return bookList;
    return {
      ...bookList,
      bookIds: bookList.bookIds.filter((item) => item !== bookId),
      updatedAt: deletedAt,
    };
  });
  state.deletedBookTombstones = stateArray(state, 'deletedBookTombstones')
    .filter((entry) => entry?.bookId !== bookId);
  bumpStateVersion(persistedState);
  return trashedBook;
}

export function restoreBookFromTrashInState(persistedState, bookId, restoredAt = Date.now()) {
  const state = persistedState?.state;
  if (!state) return null;
  const trashedBook = stateArray(state, 'trashedBooks').find((entry) => entryBookId(entry) === bookId);
  if (!trashedBook) return null;

  const activeBooks = stateArray(state, 'books');
  if (!activeBooks.some((book) => book?.id === bookId)) state.books = [trashedBook.book, ...activeBooks];
  state.trashedBooks = stateArray(state, 'trashedBooks').filter((entry) => entryBookId(entry) !== bookId);
  const positions = new Map(
    stateArray(trashedBook, 'bookListPositions').map((position) => [position.bookListId, position.index]),
  );
  state.bookLists = stateArray(state, 'bookLists').map((bookList) => {
    const savedIndex = positions.get(bookList.id);
    if (!Number.isInteger(savedIndex) || stateArray(bookList, 'bookIds').includes(bookId)) return bookList;
    const bookIds = [...bookList.bookIds];
    bookIds.splice(Math.min(Math.max(savedIndex, 0), bookIds.length), 0, bookId);
    return { ...bookList, bookIds, updatedAt: restoredAt };
  });
  state.deletedBookTombstones = stateArray(state, 'deletedBookTombstones')
    .filter((entry) => entry?.bookId !== bookId);
  bumpStateVersion(persistedState);
  return trashedBook;
}

export function permanentlyDeleteBookInState(persistedState, bookId, deletedAt = Date.now()) {
  const state = persistedState?.state;
  if (!state) return false;
  const wasPresent = stateArray(state, 'books').some((book) => book?.id === bookId)
    || stateArray(state, 'trashedBooks').some((entry) => entryBookId(entry) === bookId);
  state.books = stateArray(state, 'books').filter((book) => book?.id !== bookId);
  state.trashedBooks = stateArray(state, 'trashedBooks').filter((entry) => entryBookId(entry) !== bookId);
  state.bookLists = stateArray(state, 'bookLists').map((bookList) => ({
    ...bookList,
    bookIds: stateArray(bookList, 'bookIds').filter((item) => item !== bookId),
  }));
  for (const key of ['highlights', 'notes', 'chats', 'chatSessions', 'readingSessions']) {
    state[key] = stateArray(state, key).filter((item) => item?.bookId !== bookId);
  }
  state.deletedBookTombstones = [
    { bookId, deletedAt },
    ...stateArray(state, 'deletedBookTombstones').filter((entry) => entry?.bookId !== bookId),
  ];
  bumpStateVersion(persistedState);
  return wasPresent;
}

export function expiredTrashedBookIds(persistedState, now = Date.now()) {
  return stateArray(persistedState?.state, 'trashedBooks')
    .filter((entry) => Number.isFinite(entry?.deletedAt) && now - entry.deletedAt >= BOOK_TRASH_RETENTION_MS)
    .map(entryBookId)
    .filter(Boolean);
}

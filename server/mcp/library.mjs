import { readPersistedState, mutatePersistedState } from '../storage.mjs';
import { statusError } from '../errors.mjs';

export function requireBook(state, id) {
  const book = (state.books || []).find((item) => item.id === id);
  if (!book) throw statusError(404, '书籍不存在或已在回收站中');
  return book;
}

export async function libraryState(hydrateNote = () => false) {
  const persisted = await readPersistedState({ hydrateNote });
  if (!persisted?.state) throw statusError(409, '请先打开应用完成初始化');
  return persisted.state;
}

export function publicBook(state, book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    progress: book.progress,
    currentChapter: book.currentChapter,
    bookLists: (state.bookLists || [])
      .filter((list) => list.bookIds.includes(book.id))
      .map((list) => ({ id: list.id, name: list.name })),
  };
}

export function editBook({ book_id, book_list_ids }) {
  return mutatePersistedState((persisted) => {
    const state = persisted.state;
    const book = requireBook(state, book_id);
    const selected = new Set(book_list_ids);
    const lists = state.bookLists || [];
    if ([...selected].some((id) => !lists.some((list) => list.id === id)))
      throw statusError(404, '指定书单不存在');
    state.bookLists = lists.map((list) => {
      const included = list.bookIds.includes(book_id);
      if (included === selected.has(list.id)) return list;
      return {
        ...list,
        bookIds: selected.has(list.id)
          ? [...list.bookIds, book_id]
          : list.bookIds.filter((id) => id !== book_id),
        updatedAt: Math.max(Date.now(), (list.updatedAt || 0) + 1),
      };
    });
    return { book: publicBook(state, book) };
  });
}

export function editBookList({ book_list_id, expected_updated_at, name, note, book_ids }) {
  return mutatePersistedState((persisted) => {
    const state = persisted.state;
    const list = (state.bookLists || []).find((item) => item.id === book_list_id);
    if (!list) throw statusError(404, '书单不存在，请先使用 list_book_list 查询');
    if (expected_updated_at !== list.updatedAt)
      throw statusError(409, '书单已更新，请重新查询后编辑');
    if (book_ids) book_ids.forEach((id) => requireBook(state, id));
    if (name === undefined && note === undefined && book_ids === undefined)
      throw statusError(400, '至少指定一个要编辑的字段');
    const next = {
      ...list,
      ...(name !== undefined ? { name } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(book_ids ? { bookIds: [...new Set(book_ids)] } : {}),
      updatedAt: Math.max(Date.now(), list.updatedAt + 1),
    };
    state.bookLists = state.bookLists.map((item) => (item.id === book_list_id ? next : item));
    return { bookList: next };
  });
}

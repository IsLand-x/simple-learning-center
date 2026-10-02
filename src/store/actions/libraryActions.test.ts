import { describe, expect, it } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { mergeLearningState } from '../persistence/mergeLearningState';
import { createLibraryActions } from './libraryActions';

function setup() {
  let state = {
    ...useLearningStore.getInitialState(),
    bookLists: ['a', 'b', 'c'].map((id) => ({
      id,
      name: `书单 ${id}`,
      note: `备注 ${id}`,
      bookIds: [`book-${id}`],
      createdAt: 1,
      updatedAt: 2,
    })),
  };
  const actions = createLibraryActions((change) => {
    state = { ...state, ...(typeof change === 'function' ? change(state) : change) };
  });
  return { actions, getState: () => state };
}

describe('book list ordering', () => {
  it('moves in both directions without changing list contents or their edit versions', () => {
    const { actions, getState } = setup();
    const original = getState().bookLists;
    actions.moveBookList('a', 2);
    expect(getState().bookLists).toEqual([original[1], original[2], original[0]]);
    actions.moveBookList('a', 0);
    expect(getState().bookLists).toEqual(original);
    getState().bookLists.forEach((list, index) => expect(list).toBe(original[index]));
    expect(original.map((list) => list.id)).toEqual(['a', 'b', 'c']);
  });

  it.each([-1, 3, 0.5, NaN, Infinity])('ignores invalid destination %s', (destination) => {
    const { actions, getState } = setup();
    const original = getState().bookLists;
    actions.moveBookList('a', destination);
    expect(getState().bookLists).toBe(original);
  });

  it('ignores removed lists and unchanged positions', () => {
    const { actions, getState } = setup();
    actions.deleteBookList('b');
    const original = getState().bookLists;
    actions.moveBookList('b', 0);
    actions.moveBookList('a', 0);
    expect(getState().bookLists).toBe(original);
  });

  it('restores saved order through the existing persistence merge', () => {
    const { actions, getState } = setup();
    actions.moveBookList('c', 0);
    const saved = JSON.parse(JSON.stringify({ bookLists: getState().bookLists }));
    const restored = mergeLearningState(saved, useLearningStore.getInitialState());
    expect(restored.bookLists.map((list) => list.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('manual book pinning', () => {
  it('preserves pins through reading updates and persistence, and restores ordinary order on unpin', () => {
    const { actions, getState } = setup();
    const book = {
      id: 'reading',
      kind: 'demo' as const,
      title: '正在读',
      author: '作者',
      fileName: '',
      fileSize: 0,
      createdAt: 1,
      updatedAt: 2,
      progress: 20,
      currentChapter: '第一章',
      toc: [],
    };
    actions.addBooks([book, { ...book, id: 'preview', updatedAt: 3 }]);
    actions.setBookPinned(book.id, true, 10);
    actions.setBookPinned(book.id, true, 20);
    actions.updateBook(book.id, { progress: 30, updatedAt: 4 });
    actions.updateBook('preview', { progress: 1, updatedAt: 5 });
    expect(getState().books.find((item) => item.id === book.id)?.pinnedAt).toBe(10);
    expect(getState().books.find((item) => item.id === 'preview')?.pinnedAt).toBeUndefined();
    const restored = mergeLearningState(
      JSON.parse(JSON.stringify({ books: getState().books })),
      useLearningStore.getInitialState(),
    );
    expect(restored.books.find((item) => item.id === book.id)?.pinnedAt).toBe(10);
    actions.setBookPinned(book.id, false);
    expect(getState().books.find((item) => item.id === book.id)).not.toHaveProperty('pinnedAt');
    expect(getState().books.find((item) => item.id === book.id)?.updatedAt).toBe(4);
  });
});

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

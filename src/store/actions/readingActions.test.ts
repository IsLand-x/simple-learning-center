import { expect, it, vi } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { createReadingActions } from './readingActions';

it('creates book notes, consolidates legacy per-book notes, and records deletion tombstones', () => {
  let state = { ...useLearningStore.getInitialState() };
  const actions = createReadingActions((change) => {
    state = { ...state, ...(typeof change === 'function' ? change(state) : change) };
  });
  actions.setBookNoteContent('book', '测试书', '初稿');
  const created = state.notes[0];
  expect(created.content).toBe('初稿');

  state = {
    ...state,
    notes: [
      created,
      { ...created, id: 'legacy', createdAt: created.createdAt + 1000, updatedAt: 1 },
    ],
  };
  actions.setBookNoteContent('book', '测试书', '合并后的正文');
  expect(state.notes).toHaveLength(1);
  expect(state.notes[0].content).toBe('合并后的正文');
  expect(state.deletedNoteTombstones.map((item) => item.noteId)).toEqual(['legacy']);
});

it('recreated notes and later edits stay newer than deletion records despite a fixed clock', () => {
  let state = {
    ...useLearningStore.getInitialState(),
    deletedNoteTombstones: [{ noteId: 'book-note:book', bookId: 'book', deletedAt: 501 }],
  };
  const actions = createReadingActions((change) => {
    state = { ...state, ...(typeof change === 'function' ? change(state) : change) };
  });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(200);
  try {
    actions.setBookNoteContent('book', '测试书', '初稿');
    expect(state.notes[0].updatedAt).toBe(502);
    expect(state.deletedNoteTombstones).toEqual([]);
    actions.setBookNoteContent('book', '测试书', '重新编辑');
    expect(state.notes[0].updatedAt).toBe(503);
  } finally {
    clock.mockRestore();
  }
});

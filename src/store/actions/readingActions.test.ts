import { expect, it } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { createReadingActions } from './readingActions';

it('records explicit deletion, recreates newer notes, and marks consolidated legacy notes as deleted', () => {
  let state = { ...useLearningStore.getInitialState() };
  const actions = createReadingActions((change) => {
    state = { ...state, ...(typeof change === 'function' ? change(state) : change) };
  });
  actions.setBookNoteContent('book', '测试书', '初稿');
  const created = state.notes[0];
  actions.deleteNote(created.id);
  expect(state.notes).toEqual([]);
  expect(state.deletedNoteTombstones[0].noteId).toBe(created.id);
  expect(state.deletedNoteTombstones[0].deletedAt).toBeGreaterThan(created.updatedAt);
  actions.setBookNoteContent('book', '测试书', '重新创建');
  expect(state.notes[0].updatedAt).toBeGreaterThan(created.updatedAt + 1);
  expect(state.deletedNoteTombstones).toEqual([]);
  actions.addNote({ ...created, id: 'legacy', createdAt: created.createdAt + 1000, updatedAt: 1 });
  actions.setBookNoteContent('book', '测试书', '合并后的正文');
  expect(state.notes).toHaveLength(1);
  expect(state.deletedNoteTombstones.map((item) => item.noteId)).toEqual(['legacy']);
});

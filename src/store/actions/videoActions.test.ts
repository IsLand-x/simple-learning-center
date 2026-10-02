import { expect, it } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { createVideoActions } from './videoActions';

it('deletes video study notes using explicit deletion records', () => {
  const note = {
    id: 'video-note',
    bookId: 'video:test',
    title: '视频笔记',
    content: '正文',
    createdAt: 1,
    updatedAt: 2,
  };
  let state = { ...useLearningStore.getInitialState(), notes: [note] };
  const actions = createVideoActions((change) => {
    state = { ...state, ...(typeof change === 'function' ? change(state) : change) };
  });
  actions.deleteVideoResource('test');
  expect(state.notes).toEqual([]);
  expect(state.deletedNoteTombstones).toHaveLength(1);
  expect(state.deletedNoteTombstones[0].noteId).toBe(note.id);
  expect(state.deletedNoteTombstones[0].deletedAt).toBeGreaterThan(note.updatedAt);
});

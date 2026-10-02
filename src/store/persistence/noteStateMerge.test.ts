import { expect, it } from 'vitest';
import { mergeReadingNotes } from './noteStateMerge';

const note = {
  id: 'note',
  bookId: 'book',
  title: '笔记',
  content: 'AI 新笔记',
  createdAt: 1,
  updatedAt: 200,
};
it('preserves newly created server notes through empty snapshots and merges newer edits', () => {
  expect(mergeReadingNotes({ notes: [] }, { notes: [note] }).notes).toEqual([note]);
  expect(
    mergeReadingNotes(
      { notes: [note] },
      { notes: [{ ...note, content: '旧正文', updatedAt: 100 }] },
    ).notes,
  ).toEqual([note]);
  expect(
    mergeReadingNotes({ notes: [{ ...note, updatedAt: 100 }] }, { notes: [note] }).notes,
  ).toEqual([note]);
});
it('requires an explicit deletion and does not resurrect deleted notes from stale snapshots', () => {
  const deleted = {
    notes: [],
    deletedNoteTombstones: [{ noteId: note.id, bookId: note.bookId, deletedAt: 300 }],
  };
  expect(mergeReadingNotes(deleted, { notes: [note] }).notes).toEqual([]);
  expect(mergeReadingNotes({ notes: [note] }, deleted).notes).toEqual([]);
  expect(mergeReadingNotes({ notes: [{ ...note, updatedAt: 400 }] }, deleted).notes).toHaveLength(
    1,
  );
});

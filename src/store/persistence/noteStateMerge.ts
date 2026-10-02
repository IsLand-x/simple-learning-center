import type { DeletedNoteTombstone, NoteItem } from '../../../contracts/reading';

type NoteState = { notes?: NoteItem[]; deletedNoteTombstones?: DeletedNoteTombstone[] };

export function mergeReadingNotes(incoming: NoteState, current: NoteState) {
  const notes = new Map((current.notes ?? []).map((note) => [note.id, note]));
  for (const note of incoming.notes ?? []) {
    const existing = notes.get(note.id);
    if (!existing || existing.bookId !== note.bookId || note.updatedAt >= existing.updatedAt) {
      notes.set(note.id, note);
    }
  }
  const deletions = new Map(
    (current.deletedNoteTombstones ?? []).map((item) => [item.noteId, item]),
  );
  for (const item of incoming.deletedNoteTombstones ?? []) {
    const existing = deletions.get(item.noteId);
    if (!existing || item.deletedAt >= existing.deletedAt) deletions.set(item.noteId, item);
  }
  return {
    notes: [...notes.values()].filter((note) => {
      const deletion = deletions.get(note.id);
      return !deletion || deletion.bookId !== note.bookId || deletion.deletedAt < note.updatedAt;
    }),
    deletedNoteTombstones: [...deletions.values()],
  };
}

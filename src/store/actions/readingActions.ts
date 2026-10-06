import type { NoteItem } from '../../../contracts/reading';
import type { LearningState, LearningStoreSet } from '../learningState';

type ReadingActions = Pick<
  LearningState,
  | 'addHighlight'
  | 'updateHighlight'
  | 'deleteHighlight'
  | 'addNote'
  | 'setBookNoteContent'
  | 'updateNote'
  | 'deleteNote'
  | 'upsertReadingSession'
>;

export function createReadingActions(set: LearningStoreSet): ReadingActions {
  return {
    addHighlight: (highlight) =>
      set((state) => ({
        highlights: [
          { ...highlight, updatedAt: highlight.updatedAt ?? highlight.createdAt },
          ...state.highlights.filter((item) => item.id !== highlight.id),
        ],
        deletedHighlightTombstones: state.deletedHighlightTombstones.filter(
          (tombstone) => tombstone.highlightId !== highlight.id,
        ),
      })),
    updateHighlight: (highlightId, changes) =>
      set((state) => {
        const updatedAt = Date.now();
        return {
          highlights: state.highlights.map((highlight) => {
            if (highlight.id !== highlightId) return highlight;
            const changedAt = Math.max(updatedAt, (highlight.updatedAt ?? highlight.createdAt) + 1);
            if ('definition' in changes) {
              return {
                ...highlight,
                definition: changes.definition?.trim() || undefined,
                updatedAt: changedAt,
              };
            }
            const comment = changes.comment?.trim();
            if (!comment) {
              const {
                comment: _comment,
                commentUpdatedAt: _commentUpdatedAt,
                ...withoutComment
              } = highlight;
              return { ...withoutComment, updatedAt };
            }
            return { ...highlight, comment, commentUpdatedAt: updatedAt, updatedAt };
          }),
        };
      }),
    deleteHighlight: (highlightId) =>
      set((state) => {
        const highlight = state.highlights.find((item) => item.id === highlightId);
        if (!highlight) return state;
        const deletedAt = Math.max(Date.now(), (highlight.updatedAt ?? highlight.createdAt) + 1);
        return {
          highlights: state.highlights.filter((item) => item.id !== highlightId),
          deletedHighlightTombstones: [
            { highlightId, bookId: highlight.bookId, deletedAt },
            ...state.deletedHighlightTombstones.filter(
              (tombstone) => tombstone.highlightId !== highlightId,
            ),
          ],
        };
      }),
    addNote: (note) =>
      set((state) => {
        const deletedAt =
          state.deletedNoteTombstones.find(
            (item) => item.noteId === note.id && item.bookId === note.bookId,
          )?.deletedAt ?? 0;
        return {
          notes: [{ ...note, updatedAt: Math.max(note.updatedAt, deletedAt + 1) }, ...state.notes],
          deletedNoteTombstones: state.deletedNoteTombstones.filter(
            (item) => item.noteId !== note.id,
          ),
        };
      }),
    setBookNoteContent: (bookId, bookTitle, content) =>
      set((state) => {
        const existing = state.notes
          .filter((note) => note.bookId === bookId)
          .sort((left, right) => left.createdAt - right.createdAt)[0];
        const timestamp = Math.max(
          Date.now(),
          (existing?.updatedAt ?? 0) + 1,
          ...state.deletedNoteTombstones
            .filter((item) => item.bookId === bookId)
            .map((item) => item.deletedAt + 1),
        );
        const note: NoteItem = existing
          ? {
              ...existing,
              title: `${bookTitle} · 阅读笔记`,
              content,
              fileName: 'reading-note.md',
              updatedAt: timestamp,
            }
          : {
              id: `book-note:${bookId}`,
              bookId,
              title: `${bookTitle} · 阅读笔记`,
              content,
              fileName: 'reading-note.md',
              createdAt: timestamp,
              updatedAt: timestamp,
            };
        return {
          notes: [note, ...state.notes.filter((item) => item.bookId !== bookId)],
          deletedNoteTombstones: [
            ...state.deletedNoteTombstones.filter((item) => item.noteId !== note.id),
            ...state.notes
              .filter((item) => item.bookId === bookId && item.id !== note.id)
              .map((item) => ({
                noteId: item.id,
                bookId,
                deletedAt: Math.max(timestamp, item.updatedAt + 1),
              })),
          ],
        };
      }),
    updateNote: (noteId, changes) =>
      set((state) => ({
        notes: state.notes.map((note) =>
          note.id === noteId
            ? { ...note, ...changes, updatedAt: Math.max(Date.now(), note.updatedAt + 1) }
            : note,
        ),
      })),
    deleteNote: (noteId) =>
      set((state) => {
        const note = state.notes.find((item) => item.id === noteId);
        if (!note) return state;
        return {
          notes: state.notes.filter((item) => item.id !== noteId),
          deletedNoteTombstones: [
            ...state.deletedNoteTombstones.filter((item) => item.noteId !== noteId),
            { noteId, bookId: note.bookId, deletedAt: Math.max(Date.now(), note.updatedAt + 1) },
          ],
        };
      }),
    upsertReadingSession: (session) =>
      set((state) => {
        const exists = state.readingSessions.some((item) => item.id === session.id);
        return {
          readingSessions: exists
            ? state.readingSessions.map((item) => (item.id === session.id ? session : item))
            : [session, ...state.readingSessions],
        };
      }),
  };
}

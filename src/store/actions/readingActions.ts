import type { NoteItem } from '../../types';
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
        const deletedAt = Date.now();
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
    addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
    setBookNoteContent: (bookId, bookTitle, content) =>
      set((state) => {
        const timestamp = Date.now();
        const existing = state.notes
          .filter((note) => note.bookId === bookId)
          .sort((left, right) => left.createdAt - right.createdAt)[0];
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
        };
      }),
    updateNote: (noteId, changes) =>
      set((state) => ({
        notes: state.notes.map((note) =>
          note.id === noteId ? { ...note, ...changes, updatedAt: Date.now() } : note,
        ),
      })),
    deleteNote: (noteId) =>
      set((state) => ({ notes: state.notes.filter((note) => note.id !== noteId) })),
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

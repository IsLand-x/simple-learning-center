import type { LearningState, LearningStoreSet } from '../learningState';

type ReadingActions = Pick<
  LearningState,
  | 'saveDiscussion'
  | 'deleteDiscussion'
  | 'addHighlight'
  | 'updateHighlight'
  | 'deleteHighlight'
  | 'upsertReadingSession'
>;

export function createReadingActions(set: LearningStoreSet): ReadingActions {
  return {
    saveDiscussion: (discussion) =>
      set((state) => {
        const existing = state.discussions.find((item) => item.id === discussion.id);
        if (existing?.deletedAt) return state;
        return {
          discussions: [
            { ...discussion, updatedAt: Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1) },
            ...state.discussions.filter((item) => item.id !== discussion.id),
          ],
        };
      }),
    deleteDiscussion: (id) =>
      set((state) => ({
        discussions: state.discussions.map((item) =>
          item.id === id
            ? { ...item, content: '', deletedAt: Math.max(Date.now(), item.updatedAt + 1) }
            : item,
        ),
      })),
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

import type { LearningState, LearningStoreSet } from '../learningState';

type VideoActions = Pick<
  LearningState,
  | 'upsertVideoResource'
  | 'updateVideoResource'
  | 'deleteVideoResource'
  | 'addVideoTimestampNote'
  | 'updateVideoTimestampNote'
  | 'deleteVideoTimestampNote'
  | 'setVideoPanelWidth'
>;

export function createVideoActions(set: LearningStoreSet): VideoActions {
  return {
    upsertVideoResource: (video) =>
      set((state) => ({
        videoResources: [video, ...state.videoResources.filter((item) => item.id !== video.id)],
      })),
    updateVideoResource: (videoId, changes) =>
      set((state) => ({
        videoResources: state.videoResources.map((video) =>
          video.id === videoId
            ? { ...video, ...changes, updatedAt: changes.updatedAt ?? Date.now() }
            : video,
        ),
      })),
    deleteVideoResource: (videoId) =>
      set((state) => {
        const resourceId = `video:${videoId}`;
        return {
          videoResources: state.videoResources.filter((video) => video.id !== videoId),
          videoTimestampNotes: state.videoTimestampNotes.filter((note) => note.videoId !== videoId),
          notes: state.notes.filter((note) => note.bookId !== resourceId),
          chats: state.chats.filter((message) => message.bookId !== resourceId),
          chatSessions: state.chatSessions.filter((session) => session.bookId !== resourceId),
        };
      }),
    addVideoTimestampNote: (note) =>
      set((state) => ({
        videoTimestampNotes: [
          note,
          ...state.videoTimestampNotes.filter((item) => item.id !== note.id),
        ],
      })),
    updateVideoTimestampNote: (noteId, changes) =>
      set((state) => ({
        videoTimestampNotes: state.videoTimestampNotes.map((note) =>
          note.id === noteId ? { ...note, ...changes, updatedAt: Date.now() } : note,
        ),
      })),
    deleteVideoTimestampNote: (noteId) =>
      set((state) => ({
        videoTimestampNotes: state.videoTimestampNotes.filter((note) => note.id !== noteId),
      })),
    setVideoPanelWidth: (width) => set({ videoPanelWidth: Math.min(720, Math.max(280, width)) }),
  };
}

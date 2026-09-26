import { useCallback, useEffect } from 'react';
import { useLearningStore } from '../../../../../store/useLearningStore';
import type { VideoResource } from '../../../../../../contracts/videos';
export function useVideoStudyNote(video: VideoResource) {
  const notes = useLearningStore((state) => state.notes);
  const addNote = useLearningStore((state) => state.addNote);
  const updateNote = useLearningStore((state) => state.updateNote);
  const resourceId = video ? `video:${video.id}` : '';
  const studyNote = notes.find((note) => note.bookId === resourceId);

  useEffect(() => {
    if (!video || studyNote) return;
    const state = useLearningStore.getState();
    if (state.notes.some((note) => note.bookId === `video:${video.id}`)) return;
    const timestamp = Date.now();
    state.addNote({
      id: `video-study-note:${video.id}`,
      bookId: `video:${video.id}`,
      title: `${video.title} · 学习笔记`,
      content: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }, [video, studyNote]);

  const changeStudyNote = useCallback(
    (content: string) => {
      if (!video) return;
      const current = useLearningStore.getState().notes.find((note) => note.bookId === resourceId);
      if (current) updateNote(current.id, { content });
      else {
        const timestamp = Date.now();
        addNote({
          id: `video-study-note:${video.id}`,
          bookId: resourceId,
          title: `${video.title} · 学习笔记`,
          content,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    },
    [addNote, resourceId, video, updateNote],
  );

  return { studyNote, changeStudyNote };
}

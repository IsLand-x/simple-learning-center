import { Toast } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMediaQuery } from '../../../../util/browser/useMediaQuery';
import { confirmDialog } from '../../../../util/confirmDialog';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import type { VideoResource } from '../../../../util/types';
import { importYouTubeVideo } from '../../../../util/video/youtubeVideos';
import type { YouTubePlayerHandle } from '../components/YouTubePlayer';
import { type TranscriptMode, type VideoPanel } from './model/videoTranscript';

export function useVideoPageStore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mobileLayout = useMediaQuery('(max-width: 800px)');
  const compactLayout = useMediaQuery('(max-width: 1100px)');
  const videos = useLearningStore((state) => state.videoResources);
  const notes = useLearningStore((state) => state.notes);
  const videoPanelWidth = useLearningStore((state) => state.videoPanelWidth);
  const upsertVideoResource = useLearningStore((state) => state.upsertVideoResource);
  const deleteVideoResource = useLearningStore((state) => state.deleteVideoResource);
  const addNote = useLearningStore((state) => state.addNote);
  const updateNote = useLearningStore((state) => state.updateNote);
  const setVideoPanelWidth = useLearningStore((state) => state.setVideoPanelWidth);
  const [activePanel, setActivePanel] = useState<VideoPanel | null>('transcript');
  const [transcriptMode, setTranscriptMode] = useState<TranscriptMode>('bilingual');
  const [addVisible, setAddVisible] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const requestedVideoId = searchParams.get('video') ?? '';
  const selectedVideo = videos.find((video) => video.id === requestedVideoId);

  useEffect(() => {
    if (mobileLayout || selectedVideo || !videos.length || requestedVideoId) return;
    setSearchParams({ video: videos[0].id }, { replace: true });
  }, [mobileLayout, requestedVideoId, selectedVideo, setSearchParams, videos]);

  useEffect(() => {
    setCurrentTime(selectedVideo?.lastPositionSeconds ?? 0);
    currentTimeRef.current = selectedVideo?.lastPositionSeconds ?? 0;
    if (!selectedVideo) setTranscriptMode('original');
    else if (/^zh(?:-|$)/i.test(selectedVideo.captions.originalLanguage))
      setTranscriptMode('original');
    else if (selectedVideo.captions.original.length && selectedVideo.captions.chinese.length)
      setTranscriptMode('bilingual');
    else if (selectedVideo.captions.original.length) setTranscriptMode('original');
    else setTranscriptMode('chinese');
    // Selection-derived state resets only when the selected video identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo?.id]);

  useEffect(() => {
    if (!selectedVideo) return undefined;
    const videoId = selectedVideo.id;
    return () => {
      const seconds = currentTimeRef.current;
      if (seconds > 0)
        useLearningStore.getState().updateVideoResource(videoId, { lastPositionSeconds: seconds });
    };
    // Persist the position captured for the video that owned this effect instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo?.id]);

  const resourceId = selectedVideo ? `video:${selectedVideo.id}` : '';
  const studyNote = notes.find((note) => note.bookId === resourceId);

  useEffect(() => {
    if (!selectedVideo || studyNote) return;
    const state = useLearningStore.getState();
    if (state.notes.some((note) => note.bookId === `video:${selectedVideo.id}`)) return;
    const timestamp = Date.now();
    state.addNote({
      id: `video-study-note:${selectedVideo.id}`,
      bookId: `video:${selectedVideo.id}`,
      title: `${selectedVideo.title} · 学习笔记`,
      content: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }, [selectedVideo, studyNote]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    currentTimeRef.current = seconds;
    setCurrentTime(seconds);
  }, []);

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
    currentTimeRef.current = seconds;
    setCurrentTime(seconds);
  }, []);

  const selectVideo = (video: VideoResource) => {
    setSearchParams({ video: video.id });
    setActivePanel('transcript');
  };

  const addVideo = async (event: FormEvent) => {
    event.preventDefault();
    if (!videoUrl.trim()) return;
    setSubmitting(true);
    try {
      const imported = await importYouTubeVideo(videoUrl.trim());
      const existing = videos.find((video) => video.youtubeVideoId === imported.youtubeVideoId);
      const timestamp = Date.now();
      const video: VideoResource = {
        ...imported,
        id: existing?.id ?? imported.youtubeVideoId,
        ...(existing?.lastPositionSeconds
          ? { lastPositionSeconds: existing.lastPositionSeconds }
          : {}),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      upsertVideoResource(video);
      setSearchParams({ video: video.id });
      setVideoUrl('');
      setAddVisible(false);
      Toast.success(existing ? '已更新视频资料和字幕' : '视频资料已添加');
      if (video.captions.error) Toast.warning(video.captions.error);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '添加视频失败');
    } finally {
      setSubmitting(false);
    }
  };

  const changeStudyNote = useCallback(
    (content: string) => {
      if (!selectedVideo) return;
      const current = useLearningStore.getState().notes.find((note) => note.bookId === resourceId);
      if (current) updateNote(current.id, { content });
      else {
        const timestamp = Date.now();
        addNote({
          id: `video-study-note:${selectedVideo.id}`,
          bookId: resourceId,
          title: `${selectedVideo.title} · 学习笔记`,
          content,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    },
    [addNote, resourceId, selectedVideo, updateNote],
  );

  const removeSelectedVideo = () => {
    if (!selectedVideo) return;
    confirmDialog({
      title: '删除视频资料？',
      content: `“${selectedVideo.title}”的字幕、时间点笔记、学习笔记和 AI 对话会一并删除。`,
      okText: '删除',
      okType: 'danger',
      onOk: () => {
        const nextVideo = videos.find((video) => video.id !== selectedVideo.id);
        deleteVideoResource(selectedVideo.id);
        setSearchParams(nextVideo ? { video: nextVideo.id } : {}, { replace: true });
      },
    });
  };
  return {
    videos,
    selectedVideo,
    setAddVisible,
    selectVideo,
    studyNote,
    playerRef,
    handleTimeUpdate,
    changeStudyNote,
    removeSelectedVideo,
    activePanel,
    currentTime,
    transcriptMode,
    setTranscriptMode,
    seekTo,
    mobileLayout,
    setSearchParams,
    setActivePanel,
    compactLayout,
    setVideoPanelWidth,
    videoPanelWidth,
    addVisible,
    submitting,
    addVideo,
    videoUrl,
    setVideoUrl,
  };
}

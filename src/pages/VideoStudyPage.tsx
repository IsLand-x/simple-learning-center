import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Button,
  Empty,
  Input,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconArrowLeft,
} from '@douyinfe/semi-icons';
import { Allotment } from 'allotment';
import { useSearchParams } from 'react-router-dom';
import type { YouTubePlayerHandle } from '../components/YouTubePlayer';
import { clamp } from '../lib/format';
import { confirmDialog } from '../lib/confirmDialog';
import { importYouTubeVideo } from '../lib/youtubeVideos';
import { useLearningStore } from '../store/useLearningStore';
import type { VideoResource } from '../types';
import { useMediaQuery } from '../shared/browser/useMediaQuery';
import { AppFormModal } from '../shared/ui/AppFormModal';
import { type TranscriptMode, type VideoPanel } from '../features/video/model/videoTranscript';
import {
  VideoActivityBar,
  VideoLibrary,
  VideoMainContent,
  VideoRightPanel,
} from '../features/video/ui/VideoWorkspace';

const { Text, Title } = Typography;

export function VideoStudyPage() {
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
    else if (/^zh(?:-|$)/i.test(selectedVideo.captions.originalLanguage)) setTranscriptMode('original');
    else if (selectedVideo.captions.original.length && selectedVideo.captions.chinese.length) setTranscriptMode('bilingual');
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
      if (seconds > 0) useLearningStore.getState().updateVideoResource(videoId, { lastPositionSeconds: seconds });
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
        ...(existing?.lastPositionSeconds ? { lastPositionSeconds: existing.lastPositionSeconds } : {}),
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

  const changeStudyNote = useCallback((content: string) => {
    if (!selectedVideo) return;
    const current = useLearningStore.getState().notes.find((note) => note.bookId === resourceId);
    if (current) updateNote(current.id, { content });
    else {
      const timestamp = Date.now();
      addNote({ id: `video-study-note:${selectedVideo.id}`, bookId: resourceId, title: `${selectedVideo.title} · 学习笔记`, content, createdAt: timestamp, updatedAt: timestamp });
    }
  }, [addNote, resourceId, selectedVideo, updateNote]);

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

  const library = (
    <VideoLibrary videos={videos} selectedVideoId={selectedVideo?.id} onAdd={() => setAddVisible(true)} onSelect={selectVideo} />
  );

  const mainContent = selectedVideo ? (
    <VideoMainContent
      video={selectedVideo}
      studyNote={studyNote}
      playerRef={playerRef}
      onChangeCurrentTime={handleTimeUpdate}
      onChangeStudyNote={changeStudyNote}
      onDeleteVideo={removeSelectedVideo}
    />
  ) : (
    <div className="video-detail-empty"><Empty title="选择或添加一个视频" description="视频只通过 YouTube 播放，服务器仅保存元数据、字幕和学习记录" /></div>
  );

  const rightPanel = selectedVideo && activePanel ? (
    <VideoRightPanel
      panel={activePanel}
      video={selectedVideo}
      currentTime={currentTime}
      transcriptMode={transcriptMode}
      onChangeTranscriptMode={setTranscriptMode}
      onSeek={seekTo}
    />
  ) : null;

  return (
    <main className="video-page">
      <header className="video-page__header">
        {mobileLayout && selectedVideo && (
          <Button aria-label="返回视频资料" className="video-page__back" icon={<IconArrowLeft />} theme="borderless" type="tertiary" onClick={() => setSearchParams({}, { replace: true })} />
        )}
        <div className="video-page__heading">
          <Title heading={5}>视频学习</Title>
          <Text size="small" type="tertiary">{videos.length} 个视频</Text>
        </div>
      </header>

      <div className="video-page__workspace">
        {mobileLayout ? (
          selectedVideo ? (
            <div className="video-mobile-workspace">
              <div className="video-mobile-workspace__main">{mainContent}</div>
              <div className="video-mobile-workspace__panel">{rightPanel}</div>
              <VideoActivityBar panel={activePanel} onChange={setActivePanel} />
            </div>
          ) : library
        ) : (
          <Allotment className="video-allotment">
            <Allotment.Pane minSize={160} preferredSize={compactLayout ? 180 : 240} maxSize={compactLayout ? 280 : 340}>{library}</Allotment.Pane>
            <Allotment.Pane minSize={540}>
              <section className="video-detail-layout">
                <Allotment
                  proportionalLayout={false}
                  separator={Boolean(activePanel)}
                  onDragEnd={(sizes) => {
                    if (activePanel && sizes[1]) setVideoPanelWidth(clamp(sizes[1], compactLayout ? 280 : 320, 720));
                  }}
                >
                  <Allotment.Pane minSize={compactLayout ? 300 : 420}>{mainContent}</Allotment.Pane>
                  <Allotment.Pane visible={Boolean(activePanel)} preferredSize={videoPanelWidth} minSize={compactLayout ? 280 : 320} maxSize={720}>{rightPanel}</Allotment.Pane>
                </Allotment>
                <VideoActivityBar
                  panel={activePanel}
                  onChange={(panel) => setActivePanel((current) => current === panel ? null : panel)}
                />
              </section>
            </Allotment.Pane>
          </Allotment>
        )}
      </div>

      <AppFormModal closable={false} title="添加 YouTube 视频" visible={addVisible} onCancel={() => {
        if (!submitting) setAddVisible(false);
      }}>
        <form className="video-add-form" onSubmit={addVideo}>
          <label>
            <Text strong>YouTube 视频链接</Text>
            <Input autoFocus disabled={submitting} placeholder="https://www.youtube.com/watch?v=..." value={videoUrl} onChange={setVideoUrl} />
          </label>
          <Text size="small" type="tertiary">视频不会下载到服务器；仅保存标题、频道、字幕和学习记录。中文字幕会优先使用 YouTube 提供的翻译。</Text>
          <div className="video-add-form__actions">
            <Button disabled={submitting} theme="borderless" type="tertiary" onClick={() => setAddVisible(false)}>取消</Button>
            <Button disabled={!videoUrl.trim()} htmlType="submit" loading={submitting} theme="solid" type="primary">读取视频</Button>
          </div>
        </form>
      </AppFormModal>
    </main>
  );
}

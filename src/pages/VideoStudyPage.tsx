import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  Button,
  ButtonGroup,
  Empty,
  Input,
  Modal,
  TabPane,
  Tabs,
  TextArea,
  Toast,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconArrowLeft,
  IconClock,
  IconDelete,
  IconExternalOpen,
  IconLanguage,
  IconPlus,
  IconSave,
} from '@douyinfe/semi-icons';
import { Allotment } from 'allotment';
import { useSearchParams } from 'react-router-dom';
import { ActivityRailButton } from '../components/ActivityRailButton';
import { MarkdownNoteEditor } from '../components/MarkdownNoteEditor';
import { VideoAiPanel } from '../components/RssAiPanel';
import { YouTubePlayer, type YouTubePlayerHandle } from '../components/YouTubePlayer';
import { confirmDialog } from '../lib/confirmDialog';
import { createUuid } from '../lib/uuid';
import { importYouTubeVideo } from '../lib/youtubeVideos';
import { useLearningStore } from '../store/useLearningStore';
import type { NoteItem, VideoCaptionCue, VideoResource, VideoTimestampNote } from '../types';

const { Text, Title } = Typography;

type VideoPanel = 'transcript' | 'ai' | 'notes';
type TranscriptMode = 'original' | 'chinese' | 'bilingual';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainder = safeSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function useMediaQuery(queryText: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(queryText).matches);
  useEffect(() => {
    const query = window.matchMedia(queryText);
    const update = () => setMatches(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [queryText]);
  return matches;
}

function cueAt(cues: VideoCaptionCue[], seconds: number) {
  let current: VideoCaptionCue | undefined;
  for (const cue of cues) {
    if (cue.startSeconds > seconds + 0.25) break;
    current = cue;
  }
  return current;
}

function matchingCue(cues: VideoCaptionCue[], startSeconds: number) {
  let best: VideoCaptionCue | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const cue of cues) {
    const nextDistance = Math.abs(cue.startSeconds - startSeconds);
    if (nextDistance < distance) {
      best = cue;
      distance = nextDistance;
    }
    if (cue.startSeconds > startSeconds + 2) break;
  }
  return distance <= 2 ? best : undefined;
}

function VideoLibrary({
  videos,
  selectedVideoId,
  onAdd,
  onSelect,
}: {
  videos: VideoResource[];
  selectedVideoId?: string;
  onAdd: () => void;
  onSelect: (video: VideoResource) => void;
}) {
  const groups = useMemo(() => {
    const result = new Map<string, VideoResource[]>();
    for (const video of videos) {
      const key = video.channelTitle || '未知频道';
      result.set(key, [...(result.get(key) ?? []), video]);
    }
    return [...result.entries()];
  }, [videos]);

  return (
    <section className="video-library" aria-label="视频资料">
      <div className="video-panel-header">
        <Text strong>视频资料</Text>
        <Tooltip content="添加视频">
          <Button aria-label="添加 YouTube 视频" icon={<IconPlus />} size="small" theme="borderless" type="tertiary" onClick={onAdd} />
        </Tooltip>
      </div>
      <div className="video-library__list">
        {groups.length ? groups.map(([channel, channelVideos]) => (
          <section key={channel} className="video-channel-group">
            <Text className="video-channel-group__title" size="small" type="tertiary" ellipsis={{ showTooltip: true }}>{channel}</Text>
            {channelVideos.map((video) => (
              <button
                key={video.id}
                type="button"
                aria-current={video.id === selectedVideoId ? 'page' : undefined}
                className={`video-resource-row${video.id === selectedVideoId ? ' video-resource-row--active' : ''}`}
                onClick={() => onSelect(video)}
              >
                <span className="video-resource-row__title">{video.title}</span>
                <span className="video-resource-row__meta">{formatTime(video.durationSeconds)}</span>
              </button>
            ))}
          </section>
        )) : (
          <Empty
            title="还没有视频资料"
            description="点击右上角加号，粘贴 YouTube 链接开始学习"
          />
        )}
      </div>
    </section>
  );
}

function VideoTranscriptPanel({
  video,
  currentTime,
  mode,
  onChangeMode,
  onSeek,
}: {
  video: VideoResource;
  currentTime: number;
  mode: TranscriptMode;
  onChangeMode: (mode: TranscriptMode) => void;
  onSeek: (seconds: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const original = video.captions.original;
  const chinese = video.captions.chinese;
  const displayCues = mode === 'chinese' ? chinese : original;
  const activeCue = cueAt(displayCues, currentTime);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('.video-transcript-row--active');
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCue?.startSeconds]);

  return (
    <div className="video-transcript-panel">
      <div className="video-transcript-panel__modes">
        <ButtonGroup aria-label="字幕语言">
          <Button aria-pressed={mode === 'original'} theme={mode === 'original' ? 'solid' : 'borderless'} type={mode === 'original' ? 'primary' : 'tertiary'} onClick={() => onChangeMode('original')}>英文</Button>
          <Button disabled={!chinese.length} aria-pressed={mode === 'chinese'} theme={mode === 'chinese' ? 'solid' : 'borderless'} type={mode === 'chinese' ? 'primary' : 'tertiary'} onClick={() => onChangeMode('chinese')}>中文</Button>
          <Button disabled={!original.length || !chinese.length} aria-pressed={mode === 'bilingual'} theme={mode === 'bilingual' ? 'solid' : 'borderless'} type={mode === 'bilingual' ? 'primary' : 'tertiary'} onClick={() => onChangeMode('bilingual')}>双语</Button>
        </ButtonGroup>
      </div>
      <div ref={listRef} className="video-transcript-panel__list">
        {displayCues.length ? displayCues.map((cue) => {
          const active = activeCue?.startSeconds === cue.startSeconds;
          const translated = mode === 'bilingual' ? matchingCue(chinese, cue.startSeconds) : undefined;
          return (
            <button
              key={`${mode}:${cue.startSeconds}:${cue.text.slice(0, 12)}`}
              type="button"
              className={`video-transcript-row${active ? ' video-transcript-row--active' : ''}`}
              onClick={() => onSeek(cue.startSeconds)}
            >
              <span className="video-transcript-row__time">{formatTime(cue.startSeconds)}</span>
              <span className="video-transcript-row__copy">
                <span>{cue.text}</span>
                {translated?.text && <span className="video-transcript-row__translation">{translated.text}</span>}
              </span>
            </button>
          );
        }) : (
          <Empty
            title="没有可用字幕"
            description={video.captions.error || '该视频没有提供当前语言的字幕'}
          />
        )}
      </div>
    </div>
  );
}

function TimestampNotes({
  notes,
  onDelete,
  onSeek,
}: {
  notes: VideoTimestampNote[];
  onDelete: (noteId: string) => void;
  onSeek: (seconds: number) => void;
}) {
  return (
    <div className="video-timestamp-notes">
      {notes.length ? notes.map((note) => (
        <article key={note.id} className="video-note-card">
          <div className="video-note-card__header">
            <Button icon={<IconClock />} size="small" theme="borderless" type="primary" onClick={() => onSeek(note.timeSeconds)}>{formatTime(note.timeSeconds)}</Button>
            <Tooltip content="删除笔记">
              <Button aria-label="删除时间点笔记" icon={<IconDelete />} size="small" theme="borderless" type="danger" onClick={() => onDelete(note.id)} />
            </Tooltip>
          </div>
          {(note.quoteOriginal || note.quoteChinese) && (
            <blockquote>
              {note.quoteOriginal && <p>{note.quoteOriginal}</p>}
              {note.quoteChinese && <p>{note.quoteChinese}</p>}
            </blockquote>
          )}
          <p className="video-note-card__content">{note.content}</p>
        </article>
      )) : <Empty title="还没有时间点笔记" description="在播放器下方记录想法，会自动绑定当前时间和字幕" />}
    </div>
  );
}

function VideoNotesPanel({
  notes,
  studyNote,
  onChangeStudyNote,
  onDeleteTimestampNote,
  onSeek,
}: {
  notes: VideoTimestampNote[];
  studyNote?: NoteItem;
  onChangeStudyNote: (content: string) => void;
  onDeleteTimestampNote: (noteId: string) => void;
  onSeek: (seconds: number) => void;
}) {
  return (
    <Tabs className="video-notes-panel" type="button" keepDOM={false}>
      <TabPane itemKey="timestamps" tab={`时间点笔记 ${notes.length}`}>
        <TimestampNotes notes={notes} onDelete={onDeleteTimestampNote} onSeek={onSeek} />
      </TabPane>
      <TabPane itemKey="study" tab="学习笔记">
        <div className="video-study-note">
          <MarkdownNoteEditor ariaLabel="视频学习笔记" content={studyNote?.content ?? ''} onChange={onChangeStudyNote} />
        </div>
      </TabPane>
    </Tabs>
  );
}

function VideoRightPanel({
  panel,
  video,
  currentTime,
  transcriptMode,
  timestampNotes,
  studyNote,
  onChangeTranscriptMode,
  onChangeStudyNote,
  onDeleteTimestampNote,
  onSeek,
}: {
  panel: VideoPanel;
  video: VideoResource;
  currentTime: number;
  transcriptMode: TranscriptMode;
  timestampNotes: VideoTimestampNote[];
  studyNote?: NoteItem;
  onChangeTranscriptMode: (mode: TranscriptMode) => void;
  onChangeStudyNote: (content: string) => void;
  onDeleteTimestampNote: (noteId: string) => void;
  onSeek: (seconds: number) => void;
}) {
  const title = panel === 'transcript' ? '对话稿' : panel === 'ai' ? 'AI 助手' : '笔记';
  const PanelIcon = panel === 'transcript' ? IconLanguage : panel === 'ai' ? IconAIStrokedLevel1 : IconSave;
  return (
    <aside className={`right-panel video-right-panel${panel === 'ai' ? ' right-panel--ai' : ''}`} aria-label={title}>
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
          <PanelIcon size="large" className="panel-tool-icon" />
          <Text strong>{title}</Text>
        </div>
      </div>
      {panel === 'transcript' ? (
        <VideoTranscriptPanel video={video} currentTime={currentTime} mode={transcriptMode} onChangeMode={onChangeTranscriptMode} onSeek={onSeek} />
      ) : panel === 'ai' ? (
        <VideoAiPanel video={video} />
      ) : (
        <VideoNotesPanel notes={timestampNotes} studyNote={studyNote} onChangeStudyNote={onChangeStudyNote} onDeleteTimestampNote={onDeleteTimestampNote} onSeek={onSeek} />
      )}
    </aside>
  );
}

function VideoActivityBar({ panel, onChange }: { panel: VideoPanel | null; onChange: (panel: VideoPanel) => void }) {
  return (
    <nav className="activity-bar video-activity-bar" aria-label="视频学习辅助功能">
      <ActivityRailButton active={panel === 'transcript'} ariaLabel="打开对话稿" icon={<IconLanguage />} label="字幕" tooltip="查看对话稿" onClick={() => onChange('transcript')} />
      <ActivityRailButton active={panel === 'ai'} ariaLabel="打开 AI 助手" icon={<IconAIStrokedLevel1 />} label="AI" tooltip="打开 AI 助手" onClick={() => onChange('ai')} />
      <ActivityRailButton active={panel === 'notes'} ariaLabel="打开视频笔记" icon={<IconSave />} label="笔记" tooltip="查看视频笔记" onClick={() => onChange('notes')} />
    </nav>
  );
}

function VideoMainContent({
  video,
  currentTime,
  noteDraft,
  playerRef,
  onChangeCurrentTime,
  onChangeNoteDraft,
  onDeleteVideo,
  onSaveNote,
}: {
  video: VideoResource;
  currentTime: number;
  noteDraft: string;
  playerRef: RefObject<YouTubePlayerHandle>;
  onChangeCurrentTime: (seconds: number) => void;
  onChangeNoteDraft: (value: string) => void;
  onDeleteVideo: () => void;
  onSaveNote: () => void;
}) {
  return (
    <section className="video-main-pane" aria-label="视频学习区">
      <div className="video-detail-toolbar">
        <div className="video-detail-toolbar__identity">
          <Text strong ellipsis={{ showTooltip: true }}>{video.title}</Text>
          <Text size="small" type="tertiary">{video.channelTitle} · {formatTime(video.durationSeconds)}</Text>
        </div>
        <Tooltip content="在 YouTube 打开">
          <Button aria-label="在 YouTube 新窗口打开" icon={<IconExternalOpen />} size="small" theme="borderless" type="tertiary" onClick={() => window.open(video.url, '_blank', 'noopener,noreferrer')} />
        </Tooltip>
        <Tooltip content="删除视频资料">
          <Button aria-label="删除视频资料" icon={<IconDelete />} size="small" theme="borderless" type="danger" onClick={onDeleteVideo} />
        </Tooltip>
      </div>
      <div className="video-learning-stage">
        <YouTubePlayer key={video.id} ref={playerRef} videoId={video.youtubeVideoId} initialTime={video.lastPositionSeconds} onTimeUpdate={onChangeCurrentTime} />
        <section className="video-quick-note" aria-label="记录时间点笔记">
          <div className="video-quick-note__heading">
            <div><Text strong>时间点笔记</Text><Text size="small" type="tertiary">{formatTime(currentTime)}</Text></div>
            <Button disabled={!noteDraft.trim()} icon={<IconSave />} theme="solid" type="primary" onClick={onSaveNote}>保存笔记</Button>
          </div>
          <TextArea
            aria-label="时间点笔记内容"
            autosize={{ minRows: 3, maxRows: 6 }}
            maxCount={2_000}
            placeholder="记录这一刻的想法，会自动带上当前时间和对应字幕…"
            value={noteDraft}
            onChange={onChangeNoteDraft}
            onEnterPress={(event) => {
              if ((event.metaKey || event.ctrlKey) && noteDraft.trim()) onSaveNote();
            }}
          />
          <Text className="video-quick-note__hint" size="small" type="tertiary">Cmd/Ctrl + Enter 保存</Text>
        </section>
      </div>
    </section>
  );
}

export function VideoStudyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mobileLayout = useMediaQuery('(max-width: 800px)');
  const compactLayout = useMediaQuery('(max-width: 1100px)');
  const videos = useLearningStore((state) => state.videoResources);
  const timestampNotes = useLearningStore((state) => state.videoTimestampNotes);
  const notes = useLearningStore((state) => state.notes);
  const videoPanelWidth = useLearningStore((state) => state.videoPanelWidth);
  const upsertVideoResource = useLearningStore((state) => state.upsertVideoResource);
  const deleteVideoResource = useLearningStore((state) => state.deleteVideoResource);
  const addVideoTimestampNote = useLearningStore((state) => state.addVideoTimestampNote);
  const deleteVideoTimestampNote = useLearningStore((state) => state.deleteVideoTimestampNote);
  const addNote = useLearningStore((state) => state.addNote);
  const updateNote = useLearningStore((state) => state.updateNote);
  const setVideoPanelWidth = useLearningStore((state) => state.setVideoPanelWidth);
  const [activePanel, setActivePanel] = useState<VideoPanel | null>('transcript');
  const [transcriptMode, setTranscriptMode] = useState<TranscriptMode>('bilingual');
  const [addVisible, setAddVisible] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [noteDraft, setNoteDraft] = useState('');
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
    setNoteDraft('');
    if (selectedVideo && !selectedVideo.captions.chinese.length) setTranscriptMode('original');
    else setTranscriptMode('bilingual');
  }, [selectedVideo?.id]);

  useEffect(() => {
    if (!selectedVideo) return undefined;
    const videoId = selectedVideo.id;
    return () => {
      const seconds = currentTimeRef.current;
      if (seconds > 0) useLearningStore.getState().updateVideoResource(videoId, { lastPositionSeconds: seconds });
    };
  }, [selectedVideo?.id]);

  const selectedTimestampNotes = useMemo(
    () => selectedVideo
      ? timestampNotes.filter((note) => note.videoId === selectedVideo.id).sort((left, right) => left.timeSeconds - right.timeSeconds)
      : [],
    [selectedVideo, timestampNotes],
  );
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

  const saveTimestampNote = () => {
    if (!selectedVideo || !noteDraft.trim()) return;
    const originalCue = cueAt(selectedVideo.captions.original, currentTime);
    const chineseCue = cueAt(selectedVideo.captions.chinese, currentTime);
    const timestamp = Date.now();
    addVideoTimestampNote({
      id: createUuid(),
      videoId: selectedVideo.id,
      timeSeconds: currentTime,
      content: noteDraft.trim(),
      ...(originalCue?.text ? { quoteOriginal: originalCue.text } : {}),
      ...(chineseCue?.text ? { quoteChinese: chineseCue.text } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setNoteDraft('');
    setActivePanel('notes');
    Toast.success('时间点笔记已保存');
  };

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
      currentTime={currentTime}
      noteDraft={noteDraft}
      playerRef={playerRef}
      onChangeCurrentTime={handleTimeUpdate}
      onChangeNoteDraft={setNoteDraft}
      onDeleteVideo={removeSelectedVideo}
      onSaveNote={saveTimestampNote}
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
      timestampNotes={selectedTimestampNotes}
      studyNote={studyNote}
      onChangeTranscriptMode={setTranscriptMode}
      onChangeStudyNote={(content) => {
        const current = useLearningStore.getState().notes.find((note) => note.bookId === resourceId);
        if (current) updateNote(current.id, { content });
        else if (selectedVideo) {
          const timestamp = Date.now();
          addNote({ id: `video-study-note:${selectedVideo.id}`, bookId: resourceId, title: `${selectedVideo.title} · 学习笔记`, content, createdAt: timestamp, updatedAt: timestamp });
        }
      }}
      onDeleteTimestampNote={deleteVideoTimestampNote}
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

      <Modal bodyStyle={{ padding: '16px 20px 20px' }} closable={false} footer={null} title="添加 YouTube 视频" visible={addVisible} onCancel={() => {
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
      </Modal>
    </main>
  );
}

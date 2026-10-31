import './chapterVideo.css';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Empty, Spin, Typography } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import type {
  ChapterVideo,
  ChapterVideoJob,
  ChapterVideoNarration,
  MindMapSource,
} from '../../../../../../contracts/reading';
import { confirmDialog } from '../../../../../util/confirmDialog';
import { chapterEntries } from '../AssistantPanel/chapterIndex';
import { ChapterVideoGenerationForm } from './ChapterVideoGenerationForm';
import { ChapterVideoPlayer } from './ChapterVideoPlayer';
import { ChapterVideoPlaylist } from './ChapterVideoPlaylist';
import { ChapterVideoTasks } from './ChapterVideoTasks';
import { ChapterVideoTimeline } from './ChapterVideoTimeline';
import { chapterVideoParts, currentVideoChapter } from './model';
import { useChapterVideo } from './useChapterVideo';
import { useChapterVideoPlayback } from './useChapterVideoPlayback';

type VideoView = 'parts' | 'points' | 'tasks';

export function ChapterVideoPanel({
  book,
  activeHref,
  mobile = false,
  onLocateSource,
}: {
  book: BookItem;
  activeHref?: string;
  mobile?: boolean;
  onLocateSource?: (source: MindMapSource) => Promise<void>;
}) {
  const [scope, setScope] = useState<{ chapterId: string | undefined }>();
  const setChapterId = useCallback((chapterId: string | undefined) => setScope({ chapterId }), []);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [narration, setNarration] = useState<ChapterVideoNarration>();
  const [narrationReady, setNarrationReady] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const [autoplayId, setAutoplayId] = useState<string>();
  const chapters = useMemo(() => chapterEntries(book.toc), [book.toc]);
  const defaultChapterId = useMemo(
    () => currentVideoChapter(chapters, activeHref, book.currentChapter),
    [chapters, activeHref, book.currentChapter],
  );
  const chapterId = scope ? scope.chapterId : defaultChapterId;
  const ai = useChapterVideo(book, chapterId, mobile ? undefined : setChapterId);
  const parts = useMemo(() => chapterVideoParts(ai.videos, chapters), [ai.videos, chapters]);
  const exactPartIndex = parts.findIndex((item) => item.chapterId === chapterId);
  const partIndex = exactPartIndex >= 0 ? exactPartIndex : parts.length > 0 && !scope ? 0 : -1;
  const video = partIndex >= 0 ? parts[partIndex] : undefined;
  const [view, setView] = useState<VideoView>('parts');
  const viewRestored = useRef(false);
  const playback = useChapterVideoPlayback(video, autoplayId);
  const activeJobs = ai.jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const failedCount = ai.jobs.filter((job) => job.status === 'failed').length;

  useEffect(() => {
    if (ai.loading || viewRestored.current) return;
    viewRestored.current = true;
    if (activeJobs.length) setView('tasks');
  }, [ai.loading, activeJobs.length]);

  const chooseView = (next: VideoView) => {
    viewRestored.current = true;
    setView(next);
  };

  const selectScope = (id: string | undefined) => {
    setAutoplayId(undefined);
    setChapterId(id);
  };

  const openGenerateModal = () => {
    if (!scope && defaultChapterId !== undefined) {
      setChapterId(defaultChapterId);
    }
    setGenerateModalOpen(true);
  };

  const selectPart = (part: ChapterVideo | undefined) => {
    if (!part) return;
    if (part.id === video?.id) playback.play();
    else {
      setChapterId(part.chapterId);
      setAutoplayId(part.id);
    }
  };

  const start = async (targetId: string | undefined) => {
    setChapterId(targetId);
    setGenerateModalOpen(false);
    setView('tasks');
    await ai.generate(narration, { chapterId: targetId });
  };

  const generate = () => {
    const existingForScope = parts.some((item) => item.chapterId === chapterId);
    if (!existingForScope) {
      void start(chapterId);
      return;
    }
    confirmDialog({
      title: '重新生成章节视频？',
      content: '生成成功后替换服务器中此范围的视频，失败或取消时保留原视频。',
      okText: '重新生成',
      cancelText: '取消',
      onOk: () => start(chapterId),
    });
  };

  const retry = (job: ChapterVideoJob) => start(job.chapterId);

  const remove = () => {
    if (!video) return;
    confirmDialog({
      title: '删除章节视频？',
      content: '只删除服务器数据目录中此视频及其讲稿，不影响书籍正文。',
      okText: '删除',
      cancelText: '取消',
      onOk: () => ai.remove(video),
    });
  };

  return (
    <div className="chapter-video-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [color:var(--semi-color-text-0)]">
      <div className="chapter-video-actions flex shrink-0 items-center justify-between gap-4 px-3 py-2">
        <Typography.Text strong>
          章节课程{parts.length > 0 ? ` · ${parts.length} P` : ''}
        </Typography.Text>
        <Button
          size="small"
          theme={generateModalOpen ? 'light' : 'solid'}
          icon={<IconPlus />}
          aria-label="生成视频"
          aria-pressed={generateModalOpen}
          onClick={openGenerateModal}
        >
          生成视频
        </Button>
      </div>
      {video ? (
        <ChapterVideoPlayer
          video={video}
          mobile={mobile}
          playback={playback}
          part={partIndex + 1}
          total={parts.length}
          regenerateDisabled={
            ai.busy || ai.deleting || ai.loading || !ai.configured || !narrationReady
          }
          removeDisabled={ai.busy || ai.deleting}
          canPrevious={partIndex > 0}
          canNext={partIndex + 1 < parts.length}
          onPrevious={() => selectPart(parts[partIndex - 1])}
          onNext={() => selectPart(parts[partIndex + 1])}
          onEnded={() => {
            if (continuous) selectPart(parts[partIndex + 1]);
          }}
          onRegenerate={() => {
            setChapterId(video.chapterId);
            generate();
          }}
          onRemove={remove}
        />
      ) : (
        <Empty
          className="shrink-0 px-3 py-4"
          title={chapterId ? '这一章还没有视频' : '还没有全书导读视频'}
          description={
            parts.length
              ? '从选集观看已有章节，或点击右上角“生成视频”生成当前章。'
              : '点击右上角“生成视频”，默认选中当前阅读章节生成图解课程。'
          }
        />
      )}
      <nav
        aria-label="章节视频内容"
        className="chapter-video-actions flex shrink-0 border-b border-solid [border-color:var(--semi-color-border)] px-3 py-2"
      >
        <ButtonGroup>
          <Button
            size="small"
            theme={view === 'parts' ? 'solid' : 'borderless'}
            type={view === 'parts' ? 'primary' : 'tertiary'}
            aria-pressed={view === 'parts'}
            onClick={() => chooseView('parts')}
          >
            选集{parts.length ? ` ${parts.length}` : ''}
          </Button>
          <Button
            size="small"
            theme={view === 'points' ? 'solid' : 'borderless'}
            type={view === 'points' ? 'primary' : 'tertiary'}
            aria-pressed={view === 'points'}
            onClick={() => chooseView('points')}
          >
            本集要点
          </Button>
          <Button
            size="small"
            theme={view === 'tasks' ? 'solid' : 'borderless'}
            type={view === 'tasks' ? 'primary' : 'tertiary'}
            aria-pressed={view === 'tasks'}
            onClick={() => chooseView('tasks')}
          >
            生成任务
            {activeJobs.length
              ? ` ${activeJobs.length} 进行中`
              : failedCount
                ? ` ${failedCount} 失败`
                : ''}
          </Button>
        </ButtonGroup>
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        {ai.error && (
          <p
            role="alert"
            className="px-3 py-2 text-[12px] break-words [color:var(--semi-color-danger)]"
          >
            {ai.error}
          </p>
        )}
        {ai.pending && view !== 'tasks' && (
          <div
            role="status"
            className="chapter-video-actions flex items-center justify-between gap-4 px-3 py-2 text-[12px] [color:var(--semi-color-text-1)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Spin size="small" />
              {ai.stage || '生成任务已排队'}
            </span>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => void ai.cancel()}
            >
              取消生成
            </Button>
          </div>
        )}
        {ai.cancelled && !ai.busy && (
          <p role="status" className="px-3 py-2 text-[12px] [color:var(--semi-color-text-2)]">
            生成已取消，可以重新生成。
          </p>
        )}
        {view === 'parts' && (
          <ChapterVideoPlaylist
            videos={parts}
            selectedId={video?.id}
            continuous={continuous}
            onContinuousChange={setContinuous}
            onSelect={selectPart}
          />
        )}
        {view === 'points' &&
          (video ? (
            <ChapterVideoTimeline
              key={video.id}
              video={video}
              current={playback.current}
              onSeek={playback.seek}
              onLocateSource={
                onLocateSource
                  ? async (source) => {
                      playback.player.current?.pause();
                      await onLocateSource(source);
                    }
                  : undefined
              }
            />
          ) : (
            <Empty
              className="p-6"
              title="先选择一集视频"
              description="生成后可按知识点跳转并查看原文。"
            />
          ))}
        {view === 'tasks' && (
          <ChapterVideoTasks
            jobs={ai.jobs}
            ready={!ai.loading && !ai.pending && ai.configured && narrationReady}
            onSelect={selectScope}
            onCancel={ai.cancel}
            onRetry={retry}
            onRemove={ai.removeJob}
          />
        )}
      </div>
      <ChapterVideoGenerationForm
        visible={generateModalOpen}
        mobile={mobile}
        toc={book.toc}
        parts={parts}
        ai={ai}
        chapters={chapters}
        chapterId={chapterId}
        narration={narration}
        narrationReady={narrationReady}
        onClose={() => setGenerateModalOpen(false)}
        onScopeChange={selectScope}
        onNarrationChange={setNarration}
        onNarrationReady={setNarrationReady}
        onGenerate={generate}
      />
    </div>
  );
}

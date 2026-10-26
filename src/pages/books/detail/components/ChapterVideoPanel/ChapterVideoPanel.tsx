import './chapterVideo.css';
import { Button, Empty, Spin, Typography } from '@douyinfe/semi-ui';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BookItem } from '../../../../../../contracts/books';
import type { ChapterVideoNarration, MindMapSource } from '../../../../../../contracts/reading';
import { AiModelSelector } from '../../../../../components/ai/AiModelSelector';
import { confirmDialog } from '../../../../../util/confirmDialog';
import { chapterEntries } from '../AssistantPanel/chapterIndex';
import { ChapterSelect } from '../ChapterSelect';
import { ChapterVideoNarrationForm } from './ChapterVideoNarrationForm';
import { ChapterVideoPlayer } from './ChapterVideoPlayer';
import { ChapterVideoTasks } from './ChapterVideoTasks';
import { currentVideoChapter, videoTime } from './model';
import { useChapterVideo } from './useChapterVideo';

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
  const [narration, setNarration] = useState<ChapterVideoNarration>();
  const [narrationReady, setNarrationReady] = useState(false);
  const chapters = useMemo(() => chapterEntries(book.toc), [book.toc]);
  const chapterId = scope
    ? scope.chapterId
    : mobile
      ? currentVideoChapter(chapters, activeHref, book.currentChapter)
      : undefined;
  const ai = useChapterVideo(book, chapterId, mobile ? undefined : setChapterId);
  const video = ai.videos.find((item) => item.chapterId === chapterId);
  const generate = () => {
    setChapterId(chapterId);
    if (!video) {
      void ai.generate(narration);
      return;
    }
    confirmDialog({
      title: '重新生成章节视频？',
      content: '生成成功后替换服务器中此范围的视频，失败或取消时保留原视频。',
      okText: '重新生成',
      cancelText: '取消',
      onOk: () => ai.generate(narration),
    });
  };
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
    <div className="chapter-video-panel min-h-0 min-w-0 flex-1 overflow-auto [color:var(--semi-color-text-0)]">
      <div className="flex min-w-0 flex-col gap-3 border-b border-solid [border-color:var(--semi-color-border)] p-3">
        <label
          id="chapter-video-scope-label"
          htmlFor="chapter-video-scope"
          className="text-[12px] [color:var(--semi-color-text-1)]"
        >
          讲解范围
        </label>
        <ChapterSelect
          id="chapter-video-scope"
          label="选择视频讲解范围"
          labelledBy="chapter-video-scope-label"
          className="chapter-video-select w-full min-w-0"
          chapters={chapters}
          includeBook
          value={chapterId}
          disabled={ai.loading || ai.pending || ai.deleting}
          onChange={setChapterId}
        />
        <p className="text-[12px] leading-normal [color:var(--semi-color-text-2)]">
          大章按原文结构完整讲解，保留推导、例子和适用条件，时长随内容变化。全书范围生成导读。仅在点击生成后处理正文。
        </p>
        <ChapterVideoNarrationForm
          value={narration}
          disabled={ai.busy}
          onChange={setNarration}
          onReady={setNarrationReady}
        />
        <div className="chapter-video-actions flex min-w-0 flex-wrap items-center justify-between gap-4">
          <AiModelSelector
            configs={ai.configs}
            provider={ai.preferences.provider}
            model={ai.model ?? ''}
            disabled={ai.busy}
            onChange={ai.selectModel}
          />
          <Button
            size="small"
            theme="solid"
            loading={ai.busy}
            disabled={ai.loading || !ai.configured || ai.deleting || !narrationReady}
            onClick={generate}
          >
            {video ? '重新生成' : '生成视频'}
          </Button>
        </div>
        {!ai.configured && (
          <p className="text-[12px] [color:var(--semi-color-text-2)]">
            请先在<Link to="/settings">设置</Link>中配置 AI 模型。
          </p>
        )}
      </div>
      {ai.error && (
        <p role="alert" className="px-3 py-2 text-[13px] [color:var(--semi-color-danger)]">
          {ai.error}
        </p>
      )}
      <ChapterVideoTasks jobs={ai.jobs} onSelect={setChapterId} onCancel={ai.cancel} />
      {ai.pending && (
        <div role="status" className="p-3 text-[12px] [color:var(--semi-color-text-1)]">
          <div className="chapter-video-actions flex items-center justify-between gap-4">
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
        </div>
      )}
      {ai.cancelled && !ai.busy && (
        <p role="status" className="px-3 py-2 text-[12px] [color:var(--semi-color-text-2)]">
          生成已取消，可以重新生成。
        </p>
      )}
      {video ? (
        <div className="flex min-w-0 flex-col gap-4 p-3">
          <ChapterVideoPlayer key={video.id} video={video} onLocateSource={onLocateSource} />
          <div className="chapter-video-actions flex items-center justify-end">
            <Button
              size="small"
              theme="borderless"
              type="danger"
              loading={ai.deleting}
              disabled={ai.busy}
              onClick={remove}
            >
              删除视频
            </Button>
          </div>
        </div>
      ) : (
        !ai.busy && (
          <Empty
            className="px-6 py-8"
            title={chapterId ? '这一章还没有视频' : '还没有全书导读视频'}
            description="选择范围和模型，手动生成带图解的课程。"
          />
        )
      )}
      {ai.videos.length > 0 && (
        <section
          className="flex min-w-0 flex-col gap-1 border-t border-solid [border-color:var(--semi-color-border)] p-3"
          aria-label="已生成的视频"
        >
          <Typography.Text strong>已生成（{ai.videos.length}）</Typography.Text>
          {ai.videos.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`观看 ${item.chapterTitle}`}
              aria-pressed={item.id === video?.id}
              disabled={ai.busy}
              onClick={() => setChapterId(item.chapterId)}
              className={`mt-1 flex min-h-[44px] min-w-0 items-center gap-3 rounded-[var(--semi-border-radius-small)] border-0 p-2 text-left [font:inherit] touch-manipulation hover:[background:var(--semi-color-fill-0)] focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)] ${item.id === video?.id ? '[background:var(--semi-color-primary-light-default)] [color:var(--semi-color-primary)]' : 'bg-transparent [color:var(--semi-color-text-1)]'}`}
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">{item.chapterTitle}</span>
              <span className="shrink-0 text-[12px] tabular-nums">
                {videoTime(item.durationSeconds)}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

import { Button } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import type { ChapterVideoNarration } from '../../../../../../contracts/reading';
import { AiModelSelector } from '../../../../../components/ai/AiModelSelector';
import type { chapterEntries } from '../AssistantPanel/chapterIndex';
import { ChapterSelect } from '../ChapterSelect';
import { ChapterVideoNarrationForm } from './ChapterVideoNarrationForm';
import type { useChapterVideo } from './useChapterVideo';

export function ChapterVideoGenerationForm({
  ai,
  chapters,
  chapterId,
  narration,
  narrationReady,
  onScopeChange,
  onNarrationChange,
  onNarrationReady,
  onGenerate,
}: {
  ai: ReturnType<typeof useChapterVideo>;
  chapters: ReturnType<typeof chapterEntries>;
  chapterId?: string;
  narration?: ChapterVideoNarration;
  narrationReady: boolean;
  onScopeChange: (chapterId: string | undefined) => void;
  onNarrationChange: (narration: ChapterVideoNarration | undefined) => void;
  onNarrationReady: (ready: boolean) => void;
  onGenerate: () => void;
}) {
  const existing = ai.videos.some((video) => video.chapterId === chapterId);
  return (
    <section aria-label="视频生成设置" className="flex min-w-0 flex-col gap-3 p-3">
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
        onChange={onScopeChange}
      />
      <p className="text-[12px] leading-normal [color:var(--semi-color-text-2)]">
        每个章节生成一 P，完整保留推导、例子和条件；全书范围生成导读。仅在点击生成后处理正文。
      </p>
      <ChapterVideoNarrationForm
        value={narration}
        disabled={ai.busy}
        onChange={onNarrationChange}
        onReady={onNarrationReady}
      />
      <div className="chapter-video-actions flex min-w-0 flex-wrap items-center justify-between gap-4">
        <AiModelSelector
          configs={ai.configs}
          provider={ai.preferences.provider}
          model={ai.model ?? ''}
          disabled={ai.pending}
          onChange={ai.selectModel}
        />
        <Button
          size="small"
          theme="solid"
          loading={ai.busy}
          disabled={ai.loading || !ai.configured || ai.deleting || !narrationReady}
          onClick={onGenerate}
        >
          {existing ? '重新生成' : '开始生成'}
        </Button>
      </div>
      {!ai.configured && (
        <p className="text-[12px] [color:var(--semi-color-text-2)]">
          请先在<Link to="/settings">设置</Link>中配置 AI 模型。
        </p>
      )}
    </section>
  );
}

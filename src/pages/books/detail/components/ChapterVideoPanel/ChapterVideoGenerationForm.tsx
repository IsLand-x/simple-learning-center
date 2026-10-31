import { Button } from '@douyinfe/semi-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TtsStatus } from '../../../../../../contracts/ai';
import type { TocItem } from '../../../../../../contracts/books';
import type { ChapterVideo, ChapterVideoNarration } from '../../../../../../contracts/reading';
import { settingsApi } from '../../../../../api/settings';
import { AppFormModal } from '../../../../../components/AppFormModal';
import { AiModelSelector } from '../../../../../components/ai/AiModelSelector';
import type { chapterEntries } from '../AssistantPanel/chapterIndex';
import { ChapterSelect } from '../ChapterSelect';
import { ChapterVideoNarrationForm } from './ChapterVideoNarrationForm';
import { describeChapterVideoScope, videoTime } from './model';
import type { useChapterVideo } from './useChapterVideo';

const modalHistoryKey = 'learningCenterChapterVideoModal';

export function ChapterVideoGenerationForm({
  visible,
  mobile = false,
  toc,
  parts,
  ai,
  chapters,
  chapterId,
  narration,
  narrationReady,
  onClose,
  onScopeChange,
  onNarrationChange,
  onNarrationReady,
  onGenerate,
}: {
  visible: boolean;
  mobile?: boolean;
  toc: TocItem[];
  parts: ChapterVideo[];
  ai: ReturnType<typeof useChapterVideo>;
  chapters: ReturnType<typeof chapterEntries>;
  chapterId?: string;
  narration?: ChapterVideoNarration;
  narrationReady: boolean;
  onClose: () => void;
  onScopeChange: (chapterId: string | undefined) => void;
  onNarrationChange: (narration: ChapterVideoNarration | undefined) => void;
  onNarrationReady: (ready: boolean) => void;
  onGenerate: () => void;
}) {
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>();
  const [ttsError, setTtsError] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const controller = new AbortController();
    void settingsApi
      .getTts(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setTtsStatus(next);
        onNarrationChange(next.configured ? { source: 'settings' } : undefined);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTtsError('读取语音配置失败，请重新打开面板');
      })
      .finally(() => {
        if (!controller.signal.aborted) onNarrationReady(true);
      });
    return () => controller.abort();
  }, [onNarrationChange, onNarrationReady]);

  useEffect(() => {
    if (!visible || !mobile) return;
    const id = crypto.randomUUID();
    window.history.pushState(
      { ...window.history.state, [modalHistoryKey]: id },
      '',
      window.location.href,
    );
    const onPopState = (event: PopStateEvent) => {
      if (event.state?.[modalHistoryKey] !== id) {
        closeRef.current();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (window.history.state?.[modalHistoryKey] === id) {
        window.history.back();
      }
    };
  }, [visible, mobile]);

  const existingVideo = parts.find((video) => video.chapterId === chapterId);
  const scopeInfo = useMemo(
    () => describeChapterVideoScope(toc, chapters, chapterId),
    [toc, chapters, chapterId],
  );

  return (
    <AppFormModal
      centered
      visible={visible}
      title="生成章节讲解视频"
      closable={false}
      maskClosable={!ai.busy}
      width="min(520px, calc(100vw - 32px))"
      onCancel={() => {
        if (!ai.busy) onClose();
      }}
    >
      <section aria-label="视频生成设置" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            id="chapter-video-scope-label"
            htmlFor="chapter-video-scope"
            className="text-[13px] font-medium [color:var(--semi-color-text-0)]"
          >
            讲解范围（默认选中当前阅读章节）
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
        </div>

        <div
          aria-label="所含章节与视频说明"
          className="flex min-w-0 flex-col gap-2 rounded-[var(--semi-border-radius-medium)] border border-solid [border-color:var(--semi-color-border)] [background:var(--semi-color-bg-0)] p-3"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px] font-semibold [color:var(--semi-color-text-0)]">
              本次生成包含的章节
            </span>
            <p className="m-0 text-[12px] leading-[1.5] [color:var(--semi-color-text-1)]">
              {scopeInfo.scopeSummary}
            </p>
            {scopeInfo.includedChapters.length > 0 && (
              <div className="mt-1 flex max-h-[112px] flex-wrap gap-1.5 overflow-y-auto">
                {scopeInfo.includedChapters.map((label, index) => (
                  <span
                    key={`${index}:${label}`}
                    className="max-w-full truncate rounded-[var(--semi-border-radius-small)] [background:var(--semi-color-fill-0)] px-2 py-0.5 text-[11px] [color:var(--semi-color-text-1)]"
                  >
                    {index + 1}. {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-solid [border-color:var(--semi-color-border)] pt-2">
            <span className="block text-[12px] font-semibold [color:var(--semi-color-text-0)]">
              包含视频与分集说明
            </span>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] [color:var(--semi-color-text-1)]">
              {existingVideo
                ? `当前范围已生成视频《${existingVideo.title}》（时长 ${videoTime(existingVideo.durationSeconds)}），点击“重新生成”将替换此集。`
                : '当前范围尚未生成视频，点击“开始生成”将新建 1 集课程视频，并在配置了腾讯云 COS 时自动上传并默认从 COS 播放。'}
            </p>
            <p className="m-0 mt-1 text-[11px] leading-[1.45] [color:var(--semi-color-text-2)]">
              {parts.length > 0
                ? `本书当前共 ${parts.length} P 已生成视频：${parts
                    .map((item, idx) => `P${idx + 1} ${item.chapterTitle}`)
                    .join('、')}`
                : '本书暂未生成视频，生成成功后将按目录顺序组成选集（P1、P2…）。'}
            </p>
          </div>
        </div>

        <ChapterVideoNarrationForm
          value={narration}
          status={ttsStatus}
          error={ttsError}
          disabled={ai.busy}
          onChange={onNarrationChange}
        />

        {!ai.configured && (
          <p className="m-0 text-[12px] [color:var(--semi-color-text-2)]">
            请先在<Link to="/settings">设置</Link>中配置 AI 模型。
          </p>
        )}

        <div className="chapter-video-actions flex min-w-0 flex-wrap items-center justify-between gap-3 pt-1">
          <AiModelSelector
            configs={ai.configs}
            provider={ai.preferences.provider}
            model={ai.model ?? ''}
            disabled={ai.pending}
            onChange={ai.selectModel}
          />
          <div className="flex items-center gap-2">
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              disabled={ai.busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              size="small"
              theme="solid"
              loading={ai.busy}
              disabled={ai.loading || !ai.configured || ai.deleting || !narrationReady}
              onClick={onGenerate}
            >
              {existingVideo ? '重新生成' : '开始生成'}
            </Button>
          </div>
        </div>
      </section>
    </AppFormModal>
  );
}

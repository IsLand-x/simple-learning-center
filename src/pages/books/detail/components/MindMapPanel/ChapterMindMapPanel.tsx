import './mindMap.css';
import { Button, Empty, Select, Spin, Typography } from '@douyinfe/semi-ui';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BookItem } from '../../../../../../contracts/books';
import type { MindMapNode, MindMapSource } from '../../../../../../contracts/reading';
import { AiModelSelector } from '../../../../../components/ai/AiModelSelector';
import { confirmDialog } from '../../../../../util/confirmDialog';
import { chapterEntries, normalizeBookHref, sameBookFile } from '../AssistantPanel/chapterIndex';
import { MindMapCanvas } from './MindMapCanvas';
import type { MindMapPanelSelection } from './type';
import { useChapterMindMap } from './useChapterMindMap';

const { Text } = Typography;

export function ChapterMindMapPanel({
  book,
  activeHref,
  onLocateSource,
  selection,
  onSelectionChange,
}: {
  book: BookItem;
  activeHref?: string;
  selection?: MindMapPanelSelection;
  onSelectionChange?: (selection: MindMapPanelSelection) => void;
  onLocateSource?: (source: MindMapSource) => Promise<void>;
}) {
  const chapters = useMemo(() => chapterEntries(book.toc), [book.toc]);
  const [chapterId, setChapterId] = useState(() => {
    if (selection && chapters.some((chapter) => chapter.id === selection.chapterId))
      return selection.chapterId;
    const current =
      chapters.find(
        (chapter) =>
          activeHref && normalizeBookHref(chapter.href) === normalizeBookHref(activeHref),
      ) ??
      chapters.find((chapter) => chapter.label === book.currentChapter) ??
      chapters.find((chapter) => activeHref && sameBookFile(chapter.href, activeHref));
    return current?.path[0] ?? chapters[0]?.id ?? '';
  });
  const [localSelectedId, setSelectedId] = useState<string>();
  const selectedId = selection?.chapterId === chapterId ? selection.nodeId : localSelectedId;
  const [jumping, setJumping] = useState(false);
  const [jumpError, setJumpError] = useState('');
  const ai = useChapterMindMap(book, chapterId);
  const selected = ai.mindMap?.nodes.find((node) => node.id === selectedId);
  const locate = async (source: MindMapSource) => {
    if (jumping) return;
    setJumping(true);
    setJumpError('');
    try {
      if (!onLocateSource) throw new Error('阅读器尚未就绪');
      await onLocateSource(source);
    } catch (cause) {
      setJumpError(cause instanceof Error ? cause.message : '无法定位到原文');
    } finally {
      setJumping(false);
    }
  };
  const selectNode = (node: MindMapNode) => {
    setSelectedId(node.id);
    onSelectionChange?.({ chapterId, nodeId: node.id });
    setJumpError('');
    if (node.sources[0]) void locate(node.sources[0]);
  };
  const generate = () => {
    if (!ai.mindMap) {
      void ai.generate();
      return;
    }
    confirmDialog({
      title: '重新生成章节思维导图？',
      content: '生成成功后替换此章节的服务器导图，失败时保留已有内容。',
      okText: '重新生成',
      cancelText: '取消',
      onOk: () => ai.generate(),
    });
  };
  return (
    <div className="chapter-mindmap-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [color:var(--semi-color-text-0)]">
      <div className="flex shrink-0 flex-col gap-3 border-b border-solid [border-color:var(--semi-color-border)] p-3">
        <label htmlFor="mindmap-chapter" className="text-[12px] [color:var(--semi-color-text-1)]">
          章节（包含下属小节）
        </label>
        <Select
          id="mindmap-chapter"
          aria-label="选择思维导图章节"
          value={chapterId}
          disabled={!chapters.length}
          optionList={chapters.map((chapter) => ({
            value: chapter.id,
            label: `${'　'.repeat(chapter.path.length - 1)}${chapter.label}`,
          }))}
          onChange={(value) => {
            if (typeof value === 'string') {
              setChapterId(value);
              onSelectionChange?.({ chapterId: value });
              setSelectedId(undefined);
              setJumpError('');
            }
          }}
          className="w-full min-w-0"
        />
        <div className="mindmap-actions flex min-w-0 flex-wrap items-center justify-between gap-3">
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
            disabled={!ai.configured || !chapterId || ai.indexStatus === 'loading'}
            onClick={generate}
          >
            {ai.mindMap ? '重新生成' : '生成思维导图'}
          </Button>
        </div>
      </div>
      {ai.error && (
        <div
          role="alert"
          className="shrink-0 px-3 py-2 text-[13px] [color:var(--semi-color-danger)]"
        >
          {ai.error}
        </div>
      )}
      {ai.busy && (
        <div
          role="status"
          className="shrink-0 px-3 py-2 text-[12px] [color:var(--semi-color-text-1)]"
        >
          <div className="mindmap-actions flex items-center justify-between gap-3">
            <span>{ai.stage || '生成任务已排队'}</span>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => void ai.cancel()}
            >
              取消生成
            </Button>
          </div>
          <p className="mt-1 [color:var(--semi-color-text-2)]">
            关闭页面后继续生成；应用服务重启可能中断任务。
          </p>
        </div>
      )}
      {ai.mindMap ? (
        <>
          <MindMapCanvas
            key={`${ai.mindMap.id}:${ai.mindMap.revision}`}
            mindMap={ai.mindMap}
            selectedId={selectedId}
            onSelect={selectNode}
          />
          {selected && (
            <div className="max-h-[30%] shrink-0 overflow-auto border-t border-solid [border-color:var(--semi-color-border)] p-3 [background:var(--semi-color-bg-0)]">
              <Text strong>{selected.title}</Text>
              {selected.sources.map((source, index) => (
                <div key={`${source.passageId}:${index}`} className="mt-2">
                  <p className="line-clamp-4 text-[13px] leading-[1.65] [color:var(--semi-color-text-1)]">
                    “{source.quote}”
                  </p>
                  <div className="mindmap-actions flex items-center">
                    <Button
                      size="small"
                      theme="borderless"
                      disabled={jumping}
                      onClick={() => void locate(source)}
                    >
                      查看原文{selected.sources.length > 1 ? ` ${index + 1}` : ''}
                    </Button>
                  </div>
                </div>
              ))}
              {jumpError && (
                <p role="alert" className="mt-2 text-[12px] [color:var(--semi-color-danger)]">
                  {jumpError}
                </p>
              )}
            </div>
          )}
          <p className="shrink-0 px-3 py-2 text-[12px] [color:var(--semi-color-text-2)]">
            只读 · {ai.mindMap.nodes.length - 1} 个观点 · {ai.mindMap.model}
          </p>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          {ai.indexStatus === 'loading' ? (
            <Spin tip="正在建立章节定位索引" />
          ) : (
            <Empty
              title={chapters.length ? '此章节还没有思维导图' : '这本书没有可用目录'}
              description={
                !ai.configured ? (
                  <span>
                    请先<Link to="/settings">配置并选择 AI 模型</Link>
                  </span>
                ) : (
                  '生成后可浏览核心观点，点击节点回到原文'
                )
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

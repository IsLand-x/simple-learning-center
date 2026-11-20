import { IconComment } from '@douyinfe/semi-icons';
import { Button, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { useEffect, useState } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import type { DiscussionItem, MindMapSource } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { synchronizeLearningState } from '../../../../../store/learningStateSync';
import { DiscussionEditor } from './DiscussionEditor';
import { useDiscussionHistory } from './useDiscussionHistory';

export function DiscussionPanel({
  book,
  getSource,
  onLocateSource,
  mobile,
}: {
  book: BookItem;
  getSource: () => MindMapSource;
  onLocateSource?: (source: MindMapSource) => Promise<void>;
  mobile?: boolean;
}) {
  const discussions = useLearningStore((state) => state.discussions);
  const saveDiscussion = useLearningStore((state) => state.saveDiscussion);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void synchronizeLearningState(['reading']).catch(() =>
      setError('读取讨论失败，请稍后重新打开面板'),
    );
  }, [book.id]);
  const isMobile =
    mobile ?? (typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches);
  const items = discussions.filter((item) => item.bookId === book.id && !item.deletedAt);
  const selected = items.find((item) => item.id === selectedId);
  useDiscussionHistory({
    mobile: isMobile,
    active: Boolean(selected),
    onClose: () => setSelectedId(null),
  });
  if (selected)
    return (
      <DiscussionEditor
        key={selected.id}
        discussion={selected}
        onBack={() => setSelectedId(null)}
        onLocateSource={onLocateSource}
      />
    );
  const visible = items
    .filter((item) =>
      `${item.question}\n${item.content}\n${item.source.chapter}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const create = () => {
    const now = Date.now();
    const item: DiscussionItem = {
      id: crypto.randomUUID(),
      bookId: book.id,
      question: '新的讨论',
      content: '',
      source: getSource(),
      createdAt: now,
      updatedAt: now,
    };
    saveDiscussion(item);
    setSelectedId(item.id);
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col text-[var(--semi-color-text-0)]">
      <div className="panel-titlebar shrink-0 [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
        <div className="panel-titlebar__title min-w-0 text-[var(--semi-color-text-1)]">
          <IconComment size="large" className="panel-tool-icon" />
          <Typography.Text strong>讨论</Typography.Text>
          <Typography.Text type="tertiary" size="small">
            {items.length} 个问题
          </Typography.Text>
        </div>
        <Button
          className="shrink-0 mobile:relative mobile:after:absolute mobile:after:-inset-1.5 mobile:after:content-['']"
          theme="solid"
          onClick={create}
        >
          新建讨论
        </Button>
      </div>
      <div className="discussion-panel__body flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2">
        <label className="flex shrink-0 flex-col gap-1 text-sm">
          搜索讨论
          <Input
            value={search}
            onChange={setSearch}
            placeholder="问题、内容或章节"
            className="mobile:[&_input]:text-base"
          />
        </label>
        {error && <Typography.Text type="danger">{error}</Typography.Text>}
        <div className="min-h-0 flex-1 overflow-auto">
          {!visible.length && (
            <Empty
              title={search ? '没有匹配的讨论' : '还没有讨论'}
              description="新建问题，或对 AI 说“总结对话”，自动整理问答并保存。"
            />
          )}
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex min-h-[60px] w-full flex-col gap-1 rounded-[var(--semi-border-radius-small)] border-0 bg-transparent p-3 text-left text-[var(--semi-color-text-0)] hover:bg-[var(--semi-color-fill-0)] focus-visible:outline-2 focus-visible:outline-[var(--semi-color-focus-border)]"
              onClick={() => setSelectedId(item.id)}
            >
              <span className="w-full truncate text-sm font-medium">
                {item.question || '未命名讨论'}
              </span>
              <span className="w-full truncate text-xs text-[var(--semi-color-text-2)]">
                {item.source.chapter}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

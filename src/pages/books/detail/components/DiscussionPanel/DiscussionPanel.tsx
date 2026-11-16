import { Button, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { useEffect, useState } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import type { DiscussionItem, MindMapSource } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { synchronizeLearningState } from '../../../../../store/learningStateSync';
import { DiscussionEditor } from './DiscussionEditor';

export function DiscussionPanel({
  book,
  getSource,
  onLocateSource,
}: {
  book: BookItem;
  getSource: () => MindMapSource;
  onLocateSource?: (source: MindMapSource) => Promise<void>;
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
  const items = discussions.filter((item) => item.bookId === book.id && !item.deletedAt);
  const selected = items.find((item) => item.id === selectedId);
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
    <div className="right-panel__body min-h-0 flex flex-col gap-3 p-3 text-[var(--semi-color-text-0)]">
      <div className="flex shrink-0 items-center justify-between gap-3 py-2">
        <Typography.Text type="tertiary" size="small">
          {items.length} 个问题
        </Typography.Text>
        <Button theme="solid" onClick={create}>
          新建讨论
        </Button>
      </div>
      <label className="flex flex-col gap-2 text-sm">
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
            description="新建问题，或在 AI 对话中将问答保存到讨论。"
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
  );
}

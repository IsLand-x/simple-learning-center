import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { useState } from 'react';
import type { DiscussionItem, MindMapSource } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { confirmDialog } from '../../../../../util/confirmDialog';
import { MarkdownNoteEditor } from '../BookNotePanel/MarkdownNoteEditor';

export function DiscussionEditor({
  discussion,
  onBack,
  onLocateSource,
}: {
  discussion: DiscussionItem;
  onBack: () => void;
  onLocateSource?: (source: MindMapSource) => Promise<void>;
}) {
  const save = useLearningStore((state) => state.saveDiscussion);
  const remove = useLearningStore((state) => state.deleteDiscussion);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  return (
    <div className="right-panel__body min-h-0 flex flex-col gap-3 p-3 text-[var(--semi-color-text-0)]">
      <div className="flex shrink-0 items-center justify-between gap-3 py-2">
        <Button theme="borderless" type="tertiary" onClick={onBack}>
          返回问题列表
        </Button>
        <Button
          theme="borderless"
          type="danger"
          onClick={() =>
            confirmDialog({
              title: '删除讨论？',
              content: '将删除服务器数据目录中的这条讨论，不影响原始 AI 对话。',
              onOk: () => {
                remove(discussion.id);
                onBack();
              },
            })
          }
        >
          删除
        </Button>
      </div>
      <label className="flex shrink-0 flex-col gap-2 text-sm">
        讨论问题
        <Input
          value={discussion.question}
          onChange={(question) => save({ ...discussion, question })}
          className="mobile:[&_input]:text-base"
        />
      </label>
      <div className="flex shrink-0 flex-col items-start gap-1 py-2">
        <Typography.Text size="small" type="tertiary">
          书中位置
        </Typography.Text>
        <Button
          className="max-w-full [&_.semi-button-content]:truncate"
          theme="borderless"
          type="primary"
          disabled={!onLocateSource || (!discussion.source.cfi && !discussion.source.href)}
          loading={locating}
          onClick={async () => {
            if (!onLocateSource) return;
            setLocating(true);
            setError('');
            try {
              await onLocateSource(discussion.source);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '跳转失败');
            } finally {
              setLocating(false);
            }
          }}
        >
          {discussion.source.chapter || '当前章节'}
        </Button>
      </div>
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      <div className="markdown-note-editor min-h-0 flex-1">
        <MarkdownNoteEditor
          ariaLabel="编辑讨论内容"
          content={discussion.content}
          onChange={(content) => save({ ...discussion, content })}
        />
        <div className="markdown-note-editor__footer">
          <Typography.Text size="small" type="tertiary">
            自动保存 · Markdown
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}

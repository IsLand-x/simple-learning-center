import { IconArrowLeft, IconDelete } from '@douyinfe/semi-icons';
import { Button, Input, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useState } from 'react';
import type { DiscussionItem, MindMapSource } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { confirmDialog } from '../../../../../util/confirmDialog';
import { MarkdownNoteEditor } from './MarkdownNoteEditor';

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col text-[var(--semi-color-text-0)]">
      <div className="panel-titlebar shrink-0 [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
        <div className="flex min-w-0 items-center gap-2">
          <Tooltip content="返回问题列表">
            <Button
              aria-label="返回问题列表"
              icon={<IconArrowLeft />}
              theme="borderless"
              type="tertiary"
              className="mobile:relative mobile:after:absolute mobile:after:-inset-1.5 mobile:after:content-['']"
              onClick={onBack}
            />
          </Tooltip>
          <Typography.Text strong>讨论</Typography.Text>
        </div>
        <Tooltip content="删除讨论">
          <Button
            aria-label="删除"
            icon={<IconDelete />}
            className="mobile:relative mobile:after:absolute mobile:after:-inset-1.5 mobile:after:content-['']"
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
          />
        </Tooltip>
      </div>
      <div className="discussion-panel__body flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2">
        <label className="flex shrink-0 flex-col gap-1 text-sm">
          讨论问题
          <Input
            value={discussion.question}
            onChange={(question) => save({ ...discussion, question })}
            className="mobile:[&_input]:text-base"
          />
        </label>
        <div className="flex min-w-0 shrink-0 items-center gap-2 mobile:min-h-11">
          <Typography.Text className="shrink-0" size="small" type="tertiary">
            书中位置
          </Typography.Text>
          <Button
            className="min-w-0 max-w-full [&_.semi-button-content]:truncate mobile:relative mobile:after:absolute mobile:after:-inset-x-1.5 mobile:after:-inset-y-2.5 mobile:after:content-['']"
            size="small"
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
    </div>
  );
}

import { Button, Toast } from '@douyinfe/semi-ui';
import type { ChatMessage } from '../../../../../../contracts/ai';
import type { MindMapSource } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';

export function SaveDiscussionButton({
  messages,
  conversationId,
  bookId,
  source,
  disabled,
}: {
  messages: ChatMessage[];
  conversationId: string;
  bookId: string;
  source: () => MindMapSource;
  disabled: boolean;
}) {
  const save = useLearningStore((state) => state.saveDiscussion);
  const discussions = useLearningStore((state) => state.discussions);
  const saved = discussions.some(
    (item) => !item.deletedAt && item.id === `discussion:${messages[0]?.id}`,
  );
  return (
    <Button
      size="small"
      theme="borderless"
      type="tertiary"
      disabled={disabled || !messages.length || saved}
      onClick={() => {
        const question = messages.find((item) => item.role === 'user');
        if (!question) return;
        const now = Date.now();
        save({
          id: `discussion:${messages[0].id}`,
          bookId,
          conversationId,
          question: question.content,
          content: messages
            .map(
              (item) =>
                `${item.role === 'user' ? '## 问题' : '## AI 回答'}\n\n${item.quote ? `> ${item.quote.text.replace(/\n/g, '\n> ')}\n\n` : ''}${item.content}`,
            )
            .join('\n\n'),
          source: source(),
          createdAt: now,
          updatedAt: now,
        });
        Toast.success('已保存，可在“讨论”面板编辑');
      }}
    >
      {saved ? '已保存到讨论' : '保存本轮到讨论'}
    </Button>
  );
}

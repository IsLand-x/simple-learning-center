import { Type } from '@earendil-works/pi-ai';
import type { ChatMessage } from '../../../contracts/ai.js';
import type { BookItem } from '../../../contracts/books.js';
import type { DiscussionItem } from '../../../contracts/reading.js';
import { statusError } from '../../infrastructure/http/errors.js';
import { mutatePersistedState, readStateProjection } from '../state/stateStore.js';
import { defineTool } from './toolDefinition.js';

export function createDiscussionTools({
  book,
  conversationId,
  userMessageId,
  onChange,
}: {
  book: BookItem;
  conversationId: string;
  userMessageId: string;
  onChange?: () => void;
}) {
  let history: Promise<Array<Pick<ChatMessage, 'id' | 'role' | 'content' | 'quote'>>> | undefined;
  const readHistory = () => {
    history ??= readStateProjection((state) => {
      const messages = (state.chats ?? [])
        .filter((item) => item.bookId === book.id && item.conversationId === conversationId)
        .sort((left, right) => left.createdAt - right.createdAt);
      const requestIndex = messages.findIndex((item) => item.id === userMessageId);
      if (requestIndex < 0) throw statusError(404, '当前会话已删除，无法整理讨论');
      return messages.slice(0, requestIndex).map(({ id, role, content, quote }) => ({
        id,
        role,
        content,
        quote,
      }));
    });
    return history;
  };
  return {
    read_current_conversation: defineTool({
      description:
        '分页读取当前 session 在本次请求之前的全部对话，包含消息 id、问题、回答和独立引用。整理或保存对话前从 offset=0 开始读取，按 nextOffset 继续，直到 hasMore=false；可读取普通模型上下文之外的早期消息。',
      inputSchema: Type.Object({
        offset: Type.Optional(Type.Integer({ minimum: 0, description: '消息偏移量，默认 0' })),
      }),
      execute: async ({ offset = 0 }) => {
        const messages = await readHistory();
        const page = messages.slice(offset, offset + 20);
        const nextOffset = offset + page.length;
        return {
          messages: page,
          total: messages.length,
          hasMore: nextOffset < messages.length,
          nextOffset,
        };
      },
    }),
    save_conversation_discussions: defineTool({
      description:
        '当用户要求“保存到对话”“保存到讨论”或“总结对话”时，将当前 session 整理成问题—答案，逐个问题保存到本书的“讨论”页签。先读取完整当前会话，再合并同一问题的追问与最终结论，保留重要依据、引用和未解决之处。每条用原始用户问题的消息 id 定位，每批最多 20 条。相同问题重复保存会跳过，保留用户编辑和删除。只有返回 saved 或 already_saved 才能确认保存成功。',
      inputSchema: Type.Object({
        entries: Type.Array(
          Type.Object({
            source_message_id: Type.String({ minLength: 1, maxLength: 200 }),
            question: Type.String({ minLength: 1, maxLength: 2_000 }),
            answer: Type.String({
              minLength: 1,
              maxLength: 100_000,
              description: '整理后的 Markdown 答案',
            }),
          }),
          { minItems: 1, maxItems: 20 },
        ),
      }),
      execute: async ({ entries }, signal) => {
        const messages = await readHistory();
        const questions = new Map(
          messages.filter((item) => item.role === 'user').map((item) => [item.id, item]),
        );
        const ids = new Set<string>();
        for (const entry of entries) {
          if (!questions.has(entry.source_message_id))
            throw statusError(400, '讨论来源必须是当前 session 中已有的用户问题');
          if (!entry.question.trim() || !entry.answer.trim())
            throw statusError(400, '讨论的问题和答案不能为空');
          if (ids.has(entry.source_message_id))
            throw statusError(400, '同一批讨论不能重复使用问题');
          ids.add(entry.source_message_id);
        }
        const results = await mutatePersistedState(
          (persisted) => {
            signal?.throwIfAborted();
            const state = persisted.state;
            if (
              !state.books?.some((item) => item.id === book.id) ||
              !state.chatSessions?.some(
                (item) => item.id === conversationId && item.bookId === book.id,
              )
            )
              throw statusError(404, '书籍或当前会话已删除，讨论未保存');
            const discussions = state.discussions ?? [];
            const results = entries.map((entry) => {
              const id = `discussion:${entry.source_message_id}`;
              const existing = discussions.find((item) => item.id === id);
              if (existing)
                return {
                  id,
                  question: existing.question,
                  status: existing.deletedAt ? 'deleted' : 'already_saved',
                };
              const message = questions.get(entry.source_message_id)!;
              const timestamp = Date.now();
              const question = entry.question.trim();
              const discussion: DiscussionItem = {
                id,
                bookId: book.id,
                conversationId,
                question,
                content: `## 问题\n\n${question}\n\n## 答案\n\n${entry.answer.trim()}`,
                source: {
                  passageId: '',
                  chapter: message.quote?.chapter || book.currentChapter || '',
                  href: '',
                  cfi:
                    !message.quote?.chapter || message.quote.chapter === book.currentChapter
                      ? book.currentCfi
                      : undefined,
                  quote: message.quote?.text ?? '',
                },
                createdAt: timestamp,
                updatedAt: timestamp,
              };
              discussions.push(discussion);
              return { id, question, status: 'saved' };
            });
            state.discussions = discussions;
            return results;
          },
          { preserveResourceFiles: true, fields: ['discussions'] },
        );
        if (results.some((item) => item.status === 'saved')) onChange?.();
        return { tab: '讨论', results };
      },
    }),
  };
}

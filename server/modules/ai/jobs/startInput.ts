import type { AiJobRequest, JobPurpose } from './types.js';
import { requiredString, optionalString, optionalReasoningEffort } from './model.js';

export function normalizeJobInput(rawInput: unknown, now = Date.now) {
  const input = rawInput as AiJobRequest | undefined;
  const purpose: JobPurpose =
    input?.purpose === 'glossary' ||
    input?.purpose === 'mindmap' ||
    input?.purpose === 'chapter-video'
      ? input.purpose
      : 'chat';
  const configId = requiredString(input?.configId, '模型配置', 200);
  const model = requiredString(input?.model, '模型名称', 300);
  const reasoningEffort = optionalReasoningEffort(input?.reasoningEffort);
  const bookId = requiredString(input?.bookId, '书籍', 240);
  const conversationId = requiredString(input?.conversationId, '对话', 200);
  const messageInput = input?.userMessage;
  const userMessageId = requiredString(messageInput?.id, '消息', 200);
  const content = requiredString(messageInput?.content, '问题内容', 50_000);
  const createdAt = now();
  const quoteText = optionalString(messageInput?.quote?.text, 20_000).trim();
  const quote = quoteText
    ? {
        text: quoteText,
        chapter: optionalString(messageInput?.quote?.chapter, 500),
      }
    : undefined;
  const currentText = optionalString(input?.currentText, 30_000);

  return {
    request: input,
    purpose,
    configId,
    model,
    reasoningEffort,
    bookId,
    conversationId,
    userMessageId,
    content,
    createdAt,
    quote,
    currentText,
  };
}

export type NormalizedJobInput = ReturnType<typeof normalizeJobInput>;

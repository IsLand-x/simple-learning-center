import { IconAlertCircle } from '@douyinfe/semi-icons';
import type { ComponentType } from 'react';
import { ChatContentItem } from './ChatContentItem';
import { parseChatItem, type ChatContentBlock } from './chatContent';
interface ChatRenderMessage {
  role?: string;
  content?: unknown;
  output_text?: string;
  status?: string;
}

export function CspSafeChatContent({
  message,
  bubbleClassName = '',
  quote,
  autoHideReasoning = false,
  ImageComponent,
}: {
  message?: ChatRenderMessage;
  bubbleClassName?: string;
  quote?: { text: string; chapter: string };
  autoHideReasoning?: boolean;
  ImageComponent?: ComponentType<{ src?: string; alt?: string }>;
}) {
  const content = message?.content;
  const blocks =
    typeof content === 'string'
      ? content
        ? [{ kind: 'markdown' as const, text: content, key: 'content' }]
        : []
      : Array.isArray(content)
        ? content.map(parseChatItem).filter((block): block is ChatContentBlock => Boolean(block))
        : message?.output_text
          ? [{ kind: 'markdown' as const, text: message.output_text, key: 'output' }]
          : [];
  const hasContent = blocks.length > 0;
  const loading = ['queued', 'in_progress'].includes(message?.status ?? '') && !hasContent;
  return (
    <div className="semi-ai-chat-dialogue-content">
      <div className="semi-ai-chat-dialogue-content-wrapper">
        {message?.status === 'failed' && (
          <div className="semi-ai-chat-dialogue-content-failed">
            <IconAlertCircle />
          </div>
        )}
        <div className="semi-ai-chat-dialogue-content-inner">
          {quote && (
            <blockquote className="ai-message-quote [width:fit-content] min-w-0 [max-width:100%] [box-sizing:border-box] [gap:2px] [margin:0_0_6px] [padding:6px_8px] [color:var(--semi-color-text-1)] [background:var(--semi-color-fill-0)] [text-align:left] [word-break:break-word]">
              <span className="ai-message-quote__label [color:var(--semi-color-primary)]">
                引用 · {quote.chapter || '当前内容'}
              </span>
              <span className="ai-message-quote__text [white-space:pre-wrap]">{quote.text}</span>
            </blockquote>
          )}
          {blocks.map((block) => (
            <ChatContentItem
              key={block.key}
              block={block}
              bubbleClassName={bubbleClassName}
              autoHideReasoning={autoHideReasoning}
              ImageComponent={ImageComponent}
            />
          ))}
        </div>
      </div>
      {loading && (
        <div className="semi-ai-chat-dialogue-content-loading" aria-label="正在生成">
          <span className="semi-ai-chat-dialogue-content-loading-item" />
          <span className="semi-ai-chat-dialogue-content-loading-item" />
          <span className="semi-ai-chat-dialogue-content-loading-item" />
        </div>
      )}
    </div>
  );
}

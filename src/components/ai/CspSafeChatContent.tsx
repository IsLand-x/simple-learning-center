import {
  IconAISearchLevel2,
  IconAlertCircle,
  IconChevronDown,
  IconWrench,
} from '@douyinfe/semi-icons';
import { useEffect, useState, type ComponentType, type SyntheticEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExpandableImage } from '../ExpandableImage';

interface ChatRenderMessage {
  role?: string;
  content?: unknown;
  output_text?: string;
  status?: string;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function markdown(
  text: string,
  key: string,
  className = '',
  ImageComponent: ComponentType<{ src?: string; alt?: string }> = ExpandableImage,
) {
  if (!text) return null;
  return (
    <div className={`${className} csp-chat-markdown min-w-0 [max-width:100%]`.trim()} key={key}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ImageComponent,
          a: ({ children, href, node }) =>
            node?.children.some((child) => child.type === 'element' && child.tagName === 'img') ? (
              <>{children}</>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function CspSafeMarkdown({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  return markdown(content, 'standalone-markdown', className);
}

function messageText(item: Record<string, unknown>) {
  if (typeof item.content === 'string') return item.content;
  if (!Array.isArray(item.content)) return '';
  return item.content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const value = part as Record<string, unknown>;
      return textValue(value.text) || textValue(value.refusal);
    })
    .filter(Boolean)
    .join('\n\n');
}

function reasoningText(item: Record<string, unknown>) {
  const groups = [item.summary, item.content];
  return groups
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const value = part as Record<string, unknown>;
      return textValue(value.text);
    })
    .filter(Boolean)
    .join('\n\n');
}

function ReasoningDetails({
  text,
  index,
  status,
  autoHideReasoning,
}: {
  text: string;
  index: number;
  status: string;
  autoHideReasoning: boolean;
}) {
  const [open, setOpen] = useState(status === 'in_progress' && !autoHideReasoning);

  useEffect(() => {
    setOpen(status === 'in_progress' && !autoHideReasoning);
  }, [autoHideReasoning, status]);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(event.currentTarget.open);
  };

  return (
    <details
      className="semi-ai-chat-dialogue-reasoning-wrapper csp-chat-reasoning"
      open={open}
      onToggle={handleToggle}
    >
      <summary className="semi-ai-chat-dialogue-reasoning-header">
        <span className="semi-ai-chat-dialogue-reasoning-header-prefix">
          <IconAISearchLevel2 />
        </span>
        <span className="semi-ai-chat-dialogue-reasoning-header-title">
          {status === 'in_progress' ? '正在思考' : '思考过程'}
        </span>
        <span className="semi-ai-chat-dialogue-reasoning-header-suffix">
          <IconChevronDown />
        </span>
      </summary>
      <div className="semi-ai-chat-dialogue-reasoning-content">
        {markdown(text, `reasoning-text-${index}`)}
      </div>
    </details>
  );
}

function renderItem(
  item: unknown,
  index: number,
  bubbleClassName: string,
  autoHideReasoning: boolean,
  ImageComponent?: ComponentType<{ src?: string; alt?: string }>,
) {
  if (!item || typeof item !== 'object') return null;
  const value = item as Record<string, unknown>;
  const type = textValue(value.type);
  if (type === 'message' || !type) {
    return markdown(messageText(value), `message-${index}`, bubbleClassName, ImageComponent);
  }
  if (type === 'reasoning') {
    const text = reasoningText(value);
    if (!text) return null;
    return (
      <ReasoningDetails
        autoHideReasoning={autoHideReasoning}
        key={`reasoning-${index}`}
        index={index}
        status={textValue(value.status)}
        text={text}
      />
    );
  }
  if (type === 'function_call' || type === 'custom_tool_call') {
    const name = textValue(value.name) || '工具';
    const argumentsText = textValue(value.arguments);
    return (
      <div
        className={`semi-ai-chat-dialogue-content-tool-call csp-chat-tool min-w-0 [max-width:100%] [justify-content:flex-start] csp-chat-tool--${textValue(value.status)}`}
        key={`tool-${index}`}
      >
        <IconWrench />
        <span>
          {value.status === 'failed'
            ? '调用失败'
            : value.status === 'in_progress'
              ? '正在调用'
              : '已调用'}{' '}
          {name}
        </span>
        {argumentsText && <code title={argumentsText}>{argumentsText}</code>}
      </div>
    );
  }
  return null;
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
  const children =
    typeof content === 'string'
      ? markdown(content, 'content', bubbleClassName, ImageComponent)
      : Array.isArray(content)
        ? content
            .map((item, index) =>
              renderItem(item, index, bubbleClassName, autoHideReasoning, ImageComponent),
            )
            .filter(Boolean)
        : markdown(message?.output_text ?? '', 'output', bubbleClassName, ImageComponent);
  const hasContent = Array.isArray(children) ? children.length > 0 : Boolean(children);
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
          {children}
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

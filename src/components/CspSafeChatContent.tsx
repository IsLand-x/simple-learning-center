import { IconAISearchLevel2, IconAlertCircle, IconChevronDown, IconWrench } from '@douyinfe/semi-icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatRenderMessage {
  role?: string;
  content?: unknown;
  output_text?: string;
  status?: string;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function markdown(text: string, key: string, className = '') {
  if (!text) return null;
  return (
    <div className={`${className} csp-chat-markdown`.trim()} key={key}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">{children}</a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function CspSafeMarkdown({ content, className = '' }: { content: string; className?: string }) {
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
  return groups.flatMap((group) => Array.isArray(group) ? group : [])
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const value = part as Record<string, unknown>;
      return textValue(value.text);
    })
    .filter(Boolean)
    .join('\n\n');
}

function renderItem(item: unknown, index: number, bubbleClassName: string) {
  if (!item || typeof item !== 'object') return null;
  const value = item as Record<string, unknown>;
  const type = textValue(value.type);
  if (type === 'message' || !type) {
    return markdown(messageText(value), `message-${index}`, bubbleClassName);
  }
  if (type === 'reasoning') {
    const text = reasoningText(value);
    if (!text) return null;
    return (
      <details
        className="semi-ai-chat-dialogue-reasoning-wrapper csp-chat-reasoning"
        key={`reasoning-${index}`}
        open={value.status === 'in_progress'}
      >
        <summary className="semi-ai-chat-dialogue-reasoning-header">
          <span className="semi-ai-chat-dialogue-reasoning-header-prefix"><IconAISearchLevel2 /></span>
          <span className="semi-ai-chat-dialogue-reasoning-header-title">
            {value.status === 'in_progress' ? '正在思考' : '思考过程'}
          </span>
          <span className="semi-ai-chat-dialogue-reasoning-header-suffix"><IconChevronDown /></span>
        </summary>
        <div className="semi-ai-chat-dialogue-reasoning-content">
          {markdown(text, `reasoning-text-${index}`)}
        </div>
      </details>
    );
  }
  if (type === 'function_call' || type === 'custom_tool_call') {
    const name = textValue(value.name) || '工具';
    const argumentsText = textValue(value.arguments);
    return (
      <div
        className={`semi-ai-chat-dialogue-content-tool-call csp-chat-tool csp-chat-tool--${textValue(value.status)}`}
        key={`tool-${index}`}
      >
        <IconWrench />
        <span>{value.status === 'failed' ? '调用失败' : value.status === 'in_progress' ? '正在调用' : '已调用'} {name}</span>
        {argumentsText && <code title={argumentsText}>{argumentsText}</code>}
      </div>
    );
  }
  return null;
}

export function CspSafeChatContent({
  message,
  bubbleClassName = '',
}: {
  message?: ChatRenderMessage;
  bubbleClassName?: string;
}) {
  const content = message?.content;
  const children = typeof content === 'string'
    ? markdown(content, 'content', bubbleClassName)
    : Array.isArray(content)
      ? content.map((item, index) => renderItem(item, index, bubbleClassName)).filter(Boolean)
      : markdown(message?.output_text ?? '', 'output', bubbleClassName);
  const hasContent = Array.isArray(children) ? children.length > 0 : Boolean(children);
  const loading = ['queued', 'in_progress'].includes(message?.status ?? '') && !hasContent;
  return (
    <div className="semi-ai-chat-dialogue-content">
      <div className="semi-ai-chat-dialogue-content-wrapper">
        {message?.status === 'failed' && (
          <div className="semi-ai-chat-dialogue-content-failed"><IconAlertCircle /></div>
        )}
        <div className="semi-ai-chat-dialogue-content-inner">{children}</div>
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

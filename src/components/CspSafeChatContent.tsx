import { IconChevronDown, IconWrench } from '@douyinfe/semi-icons';
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

function markdown(text: string, key: string) {
  if (!text) return null;
  return (
    <div className="csp-chat-markdown" key={key}>
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

function renderItem(item: unknown, index: number) {
  if (!item || typeof item !== 'object') return null;
  const value = item as Record<string, unknown>;
  const type = textValue(value.type);
  if (type === 'message' || !type) {
    return markdown(messageText(value), `message-${index}`);
  }
  if (type === 'reasoning') {
    const text = reasoningText(value);
    if (!text) return null;
    return (
      <details
        className="csp-chat-reasoning"
        key={`reasoning-${index}`}
        open={value.status === 'in_progress'}
      >
        <summary>
          <IconChevronDown />
          {value.status === 'in_progress' ? '正在思考' : '思考过程'}
        </summary>
        {markdown(text, `reasoning-text-${index}`)}
      </details>
    );
  }
  if (type === 'function_call' || type === 'custom_tool_call') {
    const name = textValue(value.name) || '工具';
    const argumentsText = textValue(value.arguments);
    return (
      <div className={`csp-chat-tool csp-chat-tool--${textValue(value.status)}`} key={`tool-${index}`}>
        <IconWrench />
        <span>{value.status === 'failed' ? '调用失败' : value.status === 'in_progress' ? '正在调用' : '已调用'} {name}</span>
        {argumentsText && <code title={argumentsText}>{argumentsText}</code>}
      </div>
    );
  }
  return null;
}

export function CspSafeChatContent({ message }: { message?: ChatRenderMessage }) {
  const content = message?.content;
  const children = typeof content === 'string'
    ? markdown(content, 'content')
    : Array.isArray(content)
      ? content.map(renderItem)
      : markdown(message?.output_text ?? '', 'output');
  return (
    <div className={`csp-chat-content csp-chat-content--${message?.role ?? 'assistant'}`}>
      {message?.status === 'failed' && <span className="csp-chat-error">生成失败</span>}
      {children}
      {['queued', 'in_progress'].includes(message?.status ?? '') && !children && (
        <span className="csp-chat-loading">服务端正在生成…</span>
      )}
    </div>
  );
}

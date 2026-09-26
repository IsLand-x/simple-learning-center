function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
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

export type ChatContentBlock =
  | { kind: 'markdown'; text: string; key: string }
  | { kind: 'reasoning'; text: string; status: string; key: string }
  | { kind: 'tool'; name: string; argumentsText: string; status: string; key: string };

export function parseChatItem(item: unknown, index: number): ChatContentBlock | null {
  if (!item || typeof item !== 'object') return null;
  const value = item as Record<string, unknown>;
  const type = textValue(value.type);
  if (type === 'message' || !type) {
    const text = messageText(value);
    return text ? { kind: 'markdown', text, key: `message-${index}` } : null;
  }
  if (type === 'reasoning') {
    const text = reasoningText(value);
    return text
      ? { kind: 'reasoning', text, status: textValue(value.status), key: `reasoning-${index}` }
      : null;
  }
  if (type === 'function_call' || type === 'custom_tool_call') {
    return {
      kind: 'tool',
      name: textValue(value.name) || '工具',
      argumentsText: textValue(value.arguments),
      status: textValue(value.status),
      key: `tool-${index}`,
    };
  }
  return null;
}

import type { AiProvider, OpenAICompatibleConfig } from '../../../../../../contracts/ai';

export type AiStatus = 'unavailable' | 'ready' | 'generating' | 'error';

export function providerLabel(provider: AiProvider | undefined, configs: OpenAICompatibleConfig[]) {
  if (!provider) return '旧模型';
  return configs.find((config) => provider === `api:${config.id}`)?.name ?? 'API';
}

export function extractInputText(inputContents?: Array<Record<string, unknown>>) {
  return (inputContents ?? [])
    .map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : ''))
    .join('')
    .trim();
}

export function makeConversationTitle(content: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || '关于本书的对话').replace(/\s+/g, ' ').slice(0, 32);
}

import type { AiReasoningEffort, OpenAICompatibleConfig } from '../types';

interface AiReasoningEffortOption {
  value: AiReasoningEffort;
  label: string;
}

interface AiReasoningProfile {
  kind: 'openai' | 'deepseek' | 'kimi-k3' | 'unsupported';
  options: AiReasoningEffortOption[];
  description: string;
}

const AUTO_OPTION: AiReasoningEffortOption = { value: 'auto', label: '自动' };

const OPENAI_OPTIONS: AiReasoningEffortOption[] = [
  AUTO_OPTION,
  { value: 'minimal', label: '最低' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
];

const NATIVE_MAX_OPTIONS: AiReasoningEffortOption[] = [
  AUTO_OPTION,
  { value: 'low', label: '低' },
  { value: 'high', label: '高' },
  { value: 'max', label: '最大' },
];

const AI_REASONING_EFFORTS = new Set<AiReasoningEffort>([
  'auto',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export function normalizeAiReasoningEffort(value: unknown): AiReasoningEffort {
  return typeof value === 'string' && AI_REASONING_EFFORTS.has(value as AiReasoningEffort)
    ? (value as AiReasoningEffort)
    : 'auto';
}

function modelSignature(config: OpenAICompatibleConfig | undefined, model: string) {
  return [config?.name, config?.baseUrl, model].filter(Boolean).join(' ').toLowerCase();
}

export function getAiReasoningProfile(
  config: OpenAICompatibleConfig | undefined,
  model: string,
): AiReasoningProfile {
  if (!config || !model) {
    return {
      kind: 'unsupported',
      options: [AUTO_OPTION],
      description: '选择模型后可设置推理强度',
    };
  }

  const signature = modelSignature(config, model);
  const isKimi = /kimi|moonshot/.test(signature);
  const isKimiK3 = /(?:^|[\s/:])kimi-k3(?:$|[-_.])/.test(signature);
  if (isKimi) {
    if (isKimiK3) {
      return {
        kind: 'kimi-k3',
        options: NATIVE_MAX_OPTIONS,
        description: 'Kimi K3：使用 reasoning_effort 的 low、high 或 max',
      };
    }
    return {
      kind: 'unsupported',
      options: [AUTO_OPTION],
      description: '当前 Kimi 模型不支持 reasoning_effort，将使用模型默认推理方式',
    };
  }

  if (/deepseek/.test(signature)) {
    return {
      kind: 'deepseek',
      options: NATIVE_MAX_OPTIONS,
      description: 'DeepSeek：使用 reasoning_effort 的 low、high 或 max',
    };
  }

  return {
    kind: 'openai',
    options: OPENAI_OPTIONS,
    description: 'OpenAI Compatible：通过 reasoning_effort 控制推理强度',
  };
}

export function coerceAiReasoningEffort(
  value: unknown,
  config: OpenAICompatibleConfig | undefined,
  model: string,
): AiReasoningEffort {
  const normalized = normalizeAiReasoningEffort(value);
  const profile = getAiReasoningProfile(config, model);
  if (profile.kind === 'unsupported') return 'auto';
  if (profile.kind === 'deepseek' || profile.kind === 'kimi-k3') {
    if (normalized === 'minimal') return 'low';
    if (normalized === 'medium' || normalized === 'xhigh') return 'high';
    return normalized;
  }
  return normalized === 'max' ? 'xhigh' : normalized;
}

export function requestReasoningEffort(value: AiReasoningEffort) {
  return value === 'auto' ? undefined : value;
}

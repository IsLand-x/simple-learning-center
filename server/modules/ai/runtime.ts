import { createModels, createProvider, envApiKeyAuth } from '@earendil-works/pi-ai';
import type { Api, Model, Models } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type { OpenAICompatibleConfig } from '../../../contracts/domain.js';
import type { ReasoningEffort } from './types.js';

export interface PiRuntime {
  models: Models;
  model: Model<Api>;
}

function normalizeBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/chat/completions')
    ? normalized.slice(0, -'/chat/completions'.length)
    : normalized;
}

export function createOpenAICompatiblePiRuntime(
  config: OpenAICompatibleConfig,
  modelId: string,
  reasoningEffort?: ReasoningEffort,
): PiRuntime {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const providerId = `learning-center:${config.id || 'openai-compatible'}`;
  const modelSignature = `${config.name || ''} ${baseUrl} ${modelId}`.toLowerCase();
  const isKimiK3 = /(?:^|[\s/:])kimi-k3(?:$|[-_.])/.test(modelSignature);
  const piModel: Model<'openai-completions'> = {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: providerId,
    baseUrl,
    reasoning: Boolean(reasoningEffort),
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: Boolean(reasoningEffort),
      ...(isKimiK3
        ? {
            thinkingFormat: 'openai',
            requiresReasoningContentOnAssistantMessages: true,
            deferredToolsMode: 'kimi',
          }
        : {}),
      supportsStrictMode: false,
    },
  };
  const models = createModels();
  models.setProvider(
    createProvider({
      id: providerId,
      name: config.name || 'OpenAI Compatible',
      baseUrl,
      auth: {
        apiKey: envApiKeyAuth(`${config.name || 'OpenAI Compatible'} API Key`, []),
      },
      models: [piModel],
      api: openAICompletionsApi(),
    }),
  );
  const registeredModel = models.getModel(providerId, modelId);
  if (!registeredModel) throw new Error('Pi AI 未能注册所选模型');
  return { models, model: registeredModel };
}

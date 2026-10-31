import { describe, expect, it } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { mergeLearningState } from './mergeLearningState';

describe('mergeLearningState', () => {
  it('purges oauthProvider configs and falls back aiPreferences to remaining API config', () => {
    const currentState = {
      ...useLearningStore.getInitialState(),
      openAIConfigs: [
        {
          id: 'custom-provider',
          name: '我的供应商',
          models: ['custom-model-1'],
          baseUrl: 'https://example.com/v1',
          apiKey: 'key',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const persistedState = {
      openAIConfigs: [
        {
          id: 'oauth-openai-codex',
          name: 'ChatGPT / Codex',
          oauthProvider: 'openai-codex' as const,
          models: ['gpt-6.1-sol'],
          baseUrl: '',
          apiKey: '',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'custom-provider',
          name: '我的供应商',
          models: ['custom-model-1'],
          baseUrl: 'https://example.com/v1',
          apiKey: 'key',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      aiPreferences: {
        provider: 'api:oauth-openai-codex' as const,
        model: 'gpt-6.1-sol',
      },
    };

    const result = mergeLearningState(persistedState, currentState);
    expect(result.openAIConfigs).toEqual([
      {
        id: 'custom-provider',
        name: '我的供应商',
        models: ['custom-model-1'],
        baseUrl: 'https://example.com/v1',
        apiKey: 'key',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    expect(result.aiPreferences.provider).toBe('api:custom-provider');
    expect(result.aiPreferences.model).toBe('custom-model-1');
  });
});

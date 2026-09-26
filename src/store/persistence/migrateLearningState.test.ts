import { describe, expect, it } from 'vitest';
import { DEFAULT_READER_AI_ASSISTANT_PROMPT } from '../../util/ai/readerAiPrompts';
import { migrateLearningState } from './migrateLearningState';

describe('learning state migrations', () => {
  it('adds the default reader assistant prompt to version 28 preferences', () => {
    const migrated = migrateLearningState(
      { aiPreferences: { provider: null, model: 'test-model' } },
      28,
    );

    expect(migrated.aiPreferences).toEqual({
      provider: null,
      model: 'test-model',
      reasoningEffort: 'auto',
      assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
      autoHideReasoning: false,
      hiddenPromptTemplateIds: [],
    });
  });

  it('preserves an explicitly configured assistant prompt', () => {
    const migrated = migrateLearningState(
      {
        aiPreferences: {
          provider: null,
          model: '',
          assistantPrompt: '请用苏格拉底式提问引导我。',
        },
      },
      28,
    );

    expect(migrated.aiPreferences?.assistantPrompt).toBe('请用苏格拉底式提问引导我。');
  });

  it('adds and preserves the automatic reasoning visibility preference', () => {
    const defaulted = migrateLearningState(
      {
        aiPreferences: {
          provider: null,
          model: '',
          assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
        },
      },
      29,
    );
    const preserved = migrateLearningState(
      {
        aiPreferences: {
          provider: null,
          model: '',
          assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
          autoHideReasoning: true,
        },
      },
      29,
    );

    expect(defaulted.aiPreferences?.autoHideReasoning).toBe(false);
    expect(preserved.aiPreferences?.autoHideReasoning).toBe(true);
  });

  it('adds and sanitizes the hidden reader shortcut preference', () => {
    const defaulted = migrateLearningState(
      {
        aiPreferences: {
          provider: null,
          model: '',
          assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
          autoHideReasoning: false,
        },
      },
      30,
    );
    const sanitized = migrateLearningState(
      {
        aiPreferences: {
          provider: null,
          model: '',
          assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
          autoHideReasoning: false,
          hiddenPromptTemplateIds: ['summarize-book', 'unknown-template', 'summarize-book'],
        },
      },
      30,
    );

    expect(defaulted.aiPreferences?.hiddenPromptTemplateIds).toEqual([]);
    expect(sanitized.aiPreferences?.hiddenPromptTemplateIds).toEqual(['summarize-book']);
  });

  it('adds and sanitizes the reasoning effort preference', () => {
    const defaulted = migrateLearningState(
      {
        aiPreferences: {
          provider: null,
          model: '',
          assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
          autoHideReasoning: false,
          hiddenPromptTemplateIds: [],
        },
      },
      31,
    );
    const preserved = migrateLearningState(
      {
        aiPreferences: {
          provider: null,
          model: '',
          reasoningEffort: 'max',
          assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
          autoHideReasoning: false,
          hiddenPromptTemplateIds: [],
        },
      },
      31,
    );

    expect(defaulted.aiPreferences?.reasoningEffort).toBe('auto');
    expect(preserved.aiPreferences?.reasoningEffort).toBe('max');
  });
});

it('preserves API key and additive OAuth configs without changing their state domain', () => {
  const configs = [
    {
      id: 'old',
      name: '旧供应商',
      baseUrl: 'https://example.com',
      apiKey: 'test',
      models: ['old-model'],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'oauth',
      oauthProvider: 'openai-codex' as const,
      name: 'ChatGPT',
      baseUrl: 'https://chatgpt.com/backend-api',
      apiKey: '',
      models: ['test-model'],
      createdAt: 2,
      updatedAt: 2,
    },
  ];
  const migrated = migrateLearningState({ openAIConfigs: configs }, 32);
  expect(migrated.openAIConfigs).toEqual(configs);
});

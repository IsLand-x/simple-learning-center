import { describe, expect, it } from 'vitest';
import { DEFAULT_READER_AI_ASSISTANT_PROMPT } from '../../lib/readerAiPrompts';
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
});

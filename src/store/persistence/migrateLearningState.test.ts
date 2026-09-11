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
});

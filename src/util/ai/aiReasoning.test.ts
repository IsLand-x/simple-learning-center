import { describe, expect, it } from 'vitest';
import type { OpenAICompatibleConfig } from '../types';
import {
  coerceAiReasoningEffort,
  getAiReasoningProfile,
  normalizeAiReasoningEffort,
  requestReasoningEffort,
} from './aiReasoning';

function config(name: string, baseUrl: string): OpenAICompatibleConfig {
  return {
    id: name,
    name,
    baseUrl,
    apiKey: '',
    models: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('AI reasoning effort compatibility', () => {
  it('uses native low, high and max levels for DeepSeek', () => {
    const deepSeek = config('DeepSeek', 'https://api.deepseek.com');

    expect(
      getAiReasoningProfile(deepSeek, 'deepseek-v4-flash').options.map(({ value }) => value),
    ).toEqual(['auto', 'low', 'high', 'max']);
    expect(coerceAiReasoningEffort('medium', deepSeek, 'deepseek-v4-flash')).toBe('high');
  });

  it('enables reasoning effort for Kimi K3 but not Kimi K2 models', () => {
    const kimi = config('Kimi', 'https://api.moonshot.ai/v1');

    expect(getAiReasoningProfile(kimi, 'kimi-k3').kind).toBe('kimi-k3');
    expect(coerceAiReasoningEffort('xhigh', kimi, 'kimi-k3')).toBe('high');
    expect(getAiReasoningProfile(kimi, 'kimi-k2.6').kind).toBe('unsupported');
    expect(coerceAiReasoningEffort('high', kimi, 'kimi-k2.6')).toBe('auto');
  });

  it('keeps OpenAI-compatible levels and omits automatic effort from requests', () => {
    const openAi = config('OpenAI', 'https://api.openai.com/v1');

    expect(coerceAiReasoningEffort('max', openAi, 'gpt-5.2')).toBe('xhigh');
    expect(normalizeAiReasoningEffort('unexpected')).toBe('auto');
    expect(requestReasoningEffort('auto')).toBeUndefined();
    expect(requestReasoningEffort('high')).toBe('high');
  });
});

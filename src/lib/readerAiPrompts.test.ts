import { describe, expect, it } from 'vitest';
import { DEFAULT_READER_AI_ASSISTANT_PROMPT, READER_AI_PROMPT_TEMPLATES } from './readerAiPrompts';

describe('reader AI prompts', () => {
  it('provides a focused default assistant style', () => {
    expect(DEFAULT_READER_AI_ASSISTANT_PROMPT).toContain('阅读学习助手');
    expect(DEFAULT_READER_AI_ASSISTANT_PROMPT).toContain('书中事实');
  });

  it('provides unique templates for the core study workflows', () => {
    expect(READER_AI_PROMPT_TEMPLATES.map((template) => template.label)).toEqual([
      '总结全书',
      '总结本章',
      '提炼要点',
      '梳理术语',
      '提取关键词',
      '章节自测',
    ]);
    expect(new Set(READER_AI_PROMPT_TEMPLATES.map((template) => template.id)).size).toBe(
      READER_AI_PROMPT_TEMPLATES.length,
    );
    expect(READER_AI_PROMPT_TEMPLATES.every((template) => template.prompt.length > 20)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_READER_AI_ASSISTANT_PROMPT } from '../../util/ai/readerAiPrompts';
import { migrateLearningState } from './migrateLearningState';
import { defaultReaderPreferences } from '../defaults';

describe('learning state migrations', () => {
  it('upgrades typography while preserving custom colors, layout and book positions', () => {
    const books = [{ id: 'book', currentCfi: 'epubcfi(/6/4!/4/2:30)', progress: 37 }];
    const readerPreferences = {
      ...defaultReaderPreferences,
      theme: 'custom',
      paragraphStyle: undefined,
      tocWidth: 330,
      panelWidth: 500,
      customStyle: {
        ...defaultReaderPreferences.customStyle,
        fontFamily: 'sans',
        fontSize: 25,
        density: 'compact',
        paperColor: '#FFF8ED',
      },
    };
    const migrated = migrateLearningState({ books, readerPreferences }, 40);
    expect(migrated.readerPreferences).toMatchObject({
      fontFamily: 'sans',
      fontSize: 25,
      lineHeight: 1.6,
      paragraphStyle: 'spaced',
      tocWidth: 330,
      panelWidth: 500,
      customStyle: readerPreferences.customStyle,
    });
    expect(migrated.books).toBe(books);
  });

  it('does not overwrite already independent typography on a repeated upgrade', () => {
    const readerPreferences = {
      ...defaultReaderPreferences,
      fontFamily: 'sans',
      fontSize: 26,
      paragraphStyle: 'book',
    };
    expect(migrateLearningState({ readerPreferences }, 40).readerPreferences).toEqual(
      readerPreferences,
    );
  });
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

  it.each([32, 33, 34, 35])(
    'preserves valid book pins and removes invalid legacy values from version %s',
    (version) => {
      const migrated = migrateLearningState(
        {
          books: [
            { id: 'valid', pinnedAt: 100 },
            { id: 'invalid', pinnedAt: -1 },
            { id: 'unread' },
          ],
        },
        version,
      );

      expect(migrated.books?.map((book) => ({ id: book.id, pinnedAt: book.pinnedAt }))).toEqual([
        { id: 'valid', pinnedAt: 100 },
        { id: 'invalid', pinnedAt: undefined },
        { id: 'unread', pinnedAt: undefined },
      ]);
    },
  );
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

it('adds explicit note deletions without losing existing version 33 notes', () => {
  const notes = [
    { id: 'note', bookId: 'book', content: '已有笔记', title: '标题', createdAt: 1, updatedAt: 2 },
  ];
  const migrated = migrateLearningState({ notes }, 33);
  expect(migrated.notes).toEqual(notes);
  expect(migrated.deletedNoteTombstones).toEqual([]);
});

it('preserves version 34 notes and highlights when splitting their transport domains', () => {
  const previous = {
    notes: [
      { id: 'note', bookId: 'book', title: '笔记', content: '正文', createdAt: 1, updatedAt: 2 },
    ],
    highlights: [
      {
        id: 'highlight',
        bookId: 'book',
        text: '原文',
        cfi: 'cfi',
        chapter: '章节',
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    deletedNoteTombstones: [],
  };
  expect(migrateLearningState(previous, 34)).toEqual({
    ...previous,
    conversationDrafts: [],
    chapterMindMaps: [],
    chapterVideos: [],
  });
});

it('keeps legacy books active and preserves archive decisions in the existing books domain', () => {
  const migrated = migrateLearningState(
    {
      books: [
        { id: 'legacy', progress: 40, pinnedAt: 10 },
        { id: 'archived', archivedAt: 20 },
        { id: 'unarchived', archiveUpdatedAt: 30 },
        { id: 'invalid', archivedAt: -1, archiveUpdatedAt: Infinity },
      ],
      notes: [{ id: 'note', content: '保留正文' }],
    },
    36,
  );
  expect(migrated.books).toEqual([
    { id: 'legacy', progress: 40, pinnedAt: 10 },
    { id: 'archived', archivedAt: 20, archiveUpdatedAt: 20 },
    { id: 'unarchived', archiveUpdatedAt: 30 },
    { id: 'invalid' },
  ]);
  expect(migrated.notes).toEqual([{ id: 'note', content: '保留正文' }]);
});

it('keeps existing highlights and optional term metadata when upgrading to version 38', () => {
  const original = {
    id: 'ordinary',
    bookId: 'book',
    text: '原文',
    cfi: 'original',
    chapter: '一',
    createdAt: 1,
  };
  const term = { ...original, id: 'term', kind: 'term', definition: '释义', updatedAt: 2 };
  const result = migrateLearningState({ highlights: [original, term] }, 37);
  expect(result.highlights).toEqual([original, term]);
});

it('adds chapter mind maps without discarding existing maps or reading records', () => {
  const previous = { readingSessions: [{ id: 'session', bookId: 'book' }] };
  expect(migrateLearningState(previous, 39)).toEqual({
    ...previous,
    chapterMindMaps: [],
    chapterVideos: [],
  });
  const maps = [{ id: 'saved-map', revision: 2 }];
  expect(migrateLearningState({ ...previous, chapterMindMaps: maps }, 39).chapterMindMaps).toBe(
    maps,
  );
});

it('adds chapter videos in version 42 and preserves existing server results and reading data', () => {
  const previous = {
    readingSessions: [{ id: 'read', bookId: 'book' }],
    chapterMindMaps: [{ id: 'map' }],
  };
  expect(migrateLearningState(previous, 41)).toEqual({ ...previous, chapterVideos: [] });
  const videos = [{ id: 'video', bookId: 'book' }];
  expect(migrateLearningState({ ...previous, chapterVideos: videos }, 41).chapterVideos).toBe(
    videos,
  );
});

import { Type } from '@earendil-works/pi-ai';
import type { TocItem } from '../../../contracts/domain.js';
import type { AiChatContext } from './types.js';
import { defineTool } from './toolDefinition.js';
import type { ToolDefinition } from './toolDefinition.js';
import { readBookPassage, searchBookContent } from '../reading/search.js';
import { createBookNote, readBookNotes, updateBookNote } from '../reading/notes.js';
import { readWebPage, searchWeb } from '../../infrastructure/http/webSearch.js';

export const DEFAULT_NOTE_ACTIONS = { createBookNote, readBookNotes, updateBookNote };
type ToolContext = Pick<
  AiChatContext,
  | 'resourceType'
  | 'purpose'
  | 'book'
  | 'rssItem'
  | 'rssFeed'
  | 'translationSource'
  | 'previousDigest'
  | 'video'
  | 'currentText'
  | 'notes'
  | 'highlights'
  | 'readingSessions'
  | 'webSearchConfig'
> &
  Required<
    Pick<AiChatContext, 'relatedRssItems' | 'digestItems' | 'digestFeeds' | 'videoTimestampNotes'>
  > & {
    noteActions: typeof DEFAULT_NOTE_ACTIONS;
    knowledgeMapAction?: (signal?: AbortSignal) => Promise<unknown>;
    infographicTools?: Record<string, ToolDefinition>;
  };

function flattenToc(items: TocItem[] = []): string[] {
  return items.flatMap((item) => [item.label, ...flattenToc(item.subitems ?? [])]);
}

function formatDuration(durationMs: number) {
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

export function createAgentTools({
  resourceType,
  purpose,
  book,
  rssItem,
  rssFeed,
  translationSource,
  relatedRssItems,
  digestItems,
  digestFeeds,
  previousDigest,
  video,
  videoTimestampNotes,
  currentText,
  notes,
  highlights,
  readingSessions,
  webSearchConfig,
  noteActions,
  knowledgeMapAction,
  infographicTools,
}: ToolContext): Record<string, ToolDefinition> {
  const webTools = {
    web_search: defineTool({
      description:
        '搜索互联网以获取外部信息、最新资料或事实来源。返回网页标题、URL 和内容摘要；重要结论应标注来源 URL。',
      inputSchema: Type.Object({
        query: Type.String({ minLength: 1, description: '适合搜索引擎使用的查询词' }),
        max_results: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 5, description: '返回结果数量，默认 5' }),
        ),
      }),
      execute: async ({ query, max_results }, signal) =>
        searchWeb(webSearchConfig, query, max_results ?? 5, signal),
    }),
    read_web_page: defineTool({
      description:
        '读取一个公开 HTTP/HTTPS 网页的正文。通常用于深入阅读 web_search 返回的 URL；引用网页信息时应保留 URL。',
      inputSchema: Type.Object({
        url: Type.String({
          minLength: 1,
          pattern: '^https?://',
          description: '要读取的完整网页 URL',
        }),
      }),
      execute: async ({ url }, signal) => readWebPage(webSearchConfig, url, signal),
    }),
  };
  if (resourceType === 'rssDigest') {
    const feedById = new Map(digestFeeds.map((feed) => [feed.id, feed]));
    return {
      read_daily_feed_items: defineTool({
        description:
          '分批读取当天需要整理进日报的 RSS 内容。返回标题、订阅源、时间、链接和正文；必须覆盖全部批次后再生成日报。',
        inputSchema: Type.Object({
          offset: Type.Optional(Type.Integer({ minimum: 0, description: '从第几条开始，默认 0' })),
          limit: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 25, description: '本批数量，默认 20' }),
          ),
        }),
        execute: async ({ offset = 0, limit = 20 }) => ({
          total: digestItems.length,
          offset,
          nextOffset: offset + limit < digestItems.length ? offset + limit : null,
          items: digestItems.slice(offset, offset + limit).map((item) => ({
            id: item.id,
            title: item.title,
            source: feedById.get(item.feedId)?.title || '未知订阅源',
            publishedAt: new Date(item.publishedAt).toISOString(),
            link: item.link,
            content: (item.fullContentText || item.contentText)
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 2_400),
          })),
        }),
      }),
      read_previous_digest: defineTool({
        description: '读取当天上一版日报，用于合并新增内容并避免重复。没有上一版时返回空内容。',
        inputSchema: Type.Object({}),
        execute: async () => ({ content: previousDigest?.content || '' }),
      }),
    };
  }
  if (resourceType === 'rss') {
    const readCurrentFeedItem = defineTool({
      description:
        purpose === 'translation'
          ? '读取当前 RSS 内容中需要翻译的稳定文本片段。每个片段必须按原 id 返回，不能修改 id 或 HTML 结构。'
          : '读取当前 RSS 内容的标题、来源、发布时间、链接和正文。',
      inputSchema: Type.Object({}),
      execute: async () => ({
        title: rssItem!.title,
        source: rssFeed?.title || '未知订阅源',
        type: rssFeed?.type || 'article',
        publishedAt: new Date(rssItem!.publishedAt).toISOString(),
        link: rssItem!.link,
        ...(purpose === 'translation'
          ? {
              translation: {
                version: 1,
                truncated: Boolean(translationSource?.truncated),
                segments: (translationSource?.segments || []).map(({ id, text }) => ({ id, text })),
              },
            }
          : {
              content: (rssItem!.fullContentText || rssItem!.contentText).slice(0, 30_000),
            }),
      }),
    });
    if (purpose === 'translation') {
      return { read_current_feed_item: readCurrentFeedItem };
    }
    return {
      read_current_feed_item: readCurrentFeedItem,
      read_related_feed_items: defineTool({
        description: '读取当前订阅源最近的其他内容，用于比较主题、变化和时间线。',
        inputSchema: Type.Object({
          max_results: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 20, description: '返回数量，默认 10' }),
          ),
        }),
        execute: async ({ max_results }) =>
          relatedRssItems.slice(0, max_results ?? 10).map((item) => ({
            title: item.title,
            publishedAt: new Date(item.publishedAt).toISOString(),
            link: item.link,
            excerpt: (item.fullContentText || item.contentText).slice(0, 800),
          })),
      }),
      ...webTools,
    };
  }
  if (resourceType === 'video') {
    return {
      read_video_transcript: defineTool({
        description: '读取当前视频的标题、频道和带时间点字幕。可选择原文、中文或双语。',
        inputSchema: Type.Object({
          language: Type.Optional(
            Type.Union(
              [Type.Literal('original'), Type.Literal('chinese'), Type.Literal('bilingual')],
              { description: '字幕语言，默认双语' },
            ),
          ),
        }),
        execute: async ({ language = 'bilingual' }) => {
          const original = Array.isArray(video!.captions?.original) ? video!.captions.original : [];
          const chinese = Array.isArray(video!.captions?.chinese) ? video!.captions.chinese : [];
          const byStart = new Map(
            chinese.map((cue) => [Math.round(cue.startSeconds * 10), cue.text]),
          );
          const cues =
            language === 'chinese'
              ? chinese.map((cue) => ({ time: cue.startSeconds, text: cue.text }))
              : original.map((cue) => ({
                  time: cue.startSeconds,
                  original: cue.text,
                  ...(language === 'bilingual'
                    ? { chinese: byStart.get(Math.round(cue.startSeconds * 10)) || '' }
                    : {}),
                }));
          return {
            title: video!.title,
            channel: video!.channelTitle,
            durationSeconds: video!.durationSeconds,
            originalLanguage: video!.captions?.originalLanguage,
            captions: cues.slice(0, 2_000),
            captionError: video!.captions?.error,
          };
        },
      }),
      read_video_notes: defineTool({
        description: '读取当前视频的时间点笔记和 Markdown 学习笔记。',
        inputSchema: Type.Object({}),
        execute: async () => ({
          timestampNotes: videoTimestampNotes.slice(0, 100).map((note) => ({
            time: note.timeSeconds,
            content: note.content,
            quoteOriginal: note.quoteOriginal,
            quoteChinese: note.quoteChinese,
          })),
          studyNotes: notes
            .slice(0, 20)
            .map((note) => ({ title: note.title, content: note.content })),
        }),
      }),
      ...webTools,
    };
  }
  return {
    ...infographicTools,
    ...(knowledgeMapAction
      ? {
          generate_book_knowledge_map: defineTool({
            description:
              '仅在读者明确要求生成全书知识地图图片时调用。自动分段分析全部已提取正文，再使用当前 ChatGPT 订阅生图；无需预先搜索或传入正文。会消耗订阅额度，可能需要数分钟。返回已保存图片地址、全书分析和覆盖范围。每个请求最多生成一次。',
            inputSchema: Type.Object({}),
            execute: async (_params, signal) => knowledgeMapAction(signal),
          }),
        }
      : {}),
    read_current_book: defineTool({
      description: '读取当前书籍的书名、作者、目录与阅读进度。只包含元数据和目录，不包含整本正文。',
      inputSchema: Type.Object({}),
      execute: async () => ({
        title: book!.title,
        author: book!.author || '未知',
        progress: `${Math.round(book!.progress)}%`,
        currentChapter: book!.currentChapter,
        currentPage: book!.currentPage,
        totalPages: book!.totalPages,
        toc: flattenToc(book!.toc).slice(0, 120),
      }),
    }),
    read_current_chapter: defineTool({
      description: '读取提问时阅读器当前加载章节的名称与正文。适合回答当前阅读位置附近的问题。',
      inputSchema: Type.Object({}),
      execute: async () => ({
        chapter: book!.currentChapter,
        visibleText: currentText.replace(/\s+/g, ' ').trim().slice(0, 12_000),
      }),
    }),
    read_book_notes: defineTool({
      description:
        '读取当前书籍最新的 Markdown 阅读笔记。编辑前必须先调用本工具，使用返回的 id 和 updatedAt 防止覆盖较新的用户修改。',
      inputSchema: Type.Object({}),
      execute: async () => noteActions.readBookNotes(book!.id),
    }),
    create_book_note: defineTool({
      description:
        '仅在用户明确要求写入笔记、且 read_book_notes 确认当前书籍没有笔记时，新建 Markdown 阅读笔记。已有笔记时必须改用 update_book_note。',
      inputSchema: Type.Object({
        content: Type.String({
          minLength: 1,
          maxLength: 100_000,
          description: '要保存的完整 Markdown 笔记正文',
        }),
      }),
      execute: async ({ content }) => noteActions.createBookNote(book!.id, book!.title, content),
    }),
    update_book_note: defineTool({
      description:
        '仅在用户明确要求修改笔记时，替换当前书籍的一篇 Markdown 笔记。必须先调用 read_book_notes，并原样使用最新的 id 与 updatedAt。',
      inputSchema: Type.Object({
        note_id: Type.String({
          minLength: 1,
          maxLength: 200,
          description: 'read_book_notes 返回的笔记 id',
        }),
        expected_updated_at: Type.Integer({
          minimum: 0,
          description: 'read_book_notes 返回的 updatedAt，用于避免覆盖并发修改',
        }),
        content: Type.String({
          minLength: 1,
          maxLength: 100_000,
          description: '编辑完成后的完整 Markdown 笔记正文',
        }),
      }),
      execute: async ({ note_id, expected_updated_at, content }) =>
        noteActions.updateBookNote(book!.id, note_id, expected_updated_at, content),
    }),
    read_book_highlights: defineTool({
      description: '读取当前书籍的高亮及读者为高亮添加的评论。',
      inputSchema: Type.Object({}),
      execute: async () =>
        highlights.slice(0, 80).map((item) => ({
          kind: item.kind ?? 'highlight',
          text: item.text,
          chapter: item.chapter,
          page: item.page,
          comment: item.comment,
        })),
    }),
    read_reading_history: defineTool({
      description: '读取当前书籍最近的阅读时长记录。',
      inputSchema: Type.Object({}),
      execute: async () =>
        readingSessions.slice(0, 40).map((item) => ({
          startedAt: new Date(item.startedAt).toISOString(),
          duration: formatDuration(item.durationMs),
        })),
    }),
    search_book_content: defineTool({
      description:
        '在当前 EPUB 整本书的正文中搜索关键词或主题。返回匹配章节、段落内容和 passageId；需要更多上下文时继续调用 read_book_passage。',
      inputSchema: Type.Object({
        query: Type.String({ minLength: 1, description: '需要在书中查找的关键词、短语或主题' }),
        max_results: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 10, description: '返回结果数量，默认 6' }),
        ),
      }),
      execute: async ({ query, max_results }) => searchBookContent(book!, query, max_results ?? 6),
    }),
    read_book_passage: defineTool({
      description:
        '根据书内搜索返回的 passageId，读取该段落及相邻上下文。passageId 必须来自 search_book_content。',
      inputSchema: Type.Object({
        passage_id: Type.String({
          minLength: 1,
          description: 'search_book_content 返回的 passageId',
        }),
      }),
      execute: async ({ passage_id }) => readBookPassage(book!, passage_id),
    }),
    ...webTools,
  };
}

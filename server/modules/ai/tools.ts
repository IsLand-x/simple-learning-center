import { Type } from '@earendil-works/pi-ai';
import type { TocItem } from '../../../contracts/books.js';
import type { AiChatContext } from './jobs/types.js';
import { defineTool } from './toolDefinition.js';
import type { ToolDefinition } from './toolDefinition.js';
import { readBookPassage, searchBookContent } from '../books/search.js';
import { appendBookNote, createBookNote, readBookNotes, updateBookNote } from '../books/notes.js';
import { readWebPage, searchWeb } from '../../infrastructure/http/webSearch.js';

export const DEFAULT_NOTE_ACTIONS = {
  appendBookNote,
  createBookNote,
  readBookNotes,
  updateBookNote,
};
type ToolContext = Pick<
  AiChatContext,
  'book' | 'currentText' | 'highlights' | 'readingSessions' | 'webSearchConfig'
> & {
  noteActions: typeof DEFAULT_NOTE_ACTIONS;
  knowledgeMapAction?: (signal?: AbortSignal) => Promise<unknown>;
  infographicTools?: Record<string, ToolDefinition>;
  diagramTools?: Record<string, ToolDefinition>;
};

function flattenToc(items: TocItem[] = []): string[] {
  return items.flatMap((item) => [item.label, ...flattenToc(item.subitems ?? [])]);
}

function formatDuration(durationMs: number) {
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

export function createAgentTools({
  book,
  currentText,
  highlights,
  readingSessions,
  webSearchConfig,
  noteActions,
  knowledgeMapAction,
  infographicTools,
  diagramTools,
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
  return {
    ...diagramTools,
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
        title: book.title,
        author: book.author || '未知',
        progress: `${Math.round(book.progress)}%`,
        currentChapter: book.currentChapter,
        currentPage: book.currentPage,
        totalPages: book.totalPages,
        toc: flattenToc(book.toc).slice(0, 120),
      }),
    }),
    read_current_chapter: defineTool({
      description: '读取提问时阅读器当前加载章节的名称与正文。适合回答当前阅读位置附近的问题。',
      inputSchema: Type.Object({}),
      execute: async () => ({
        chapter: book.currentChapter,
        visibleText: currentText.replace(/\s+/g, ' ').trim().slice(0, 12_000),
      }),
    }),
    read_book_notes: defineTool({
      description:
        '读取当前书籍最新的 Markdown 阅读笔记。编辑前必须先调用本工具，使用返回的 id 和 updatedAt 防止覆盖较新的用户修改。',
      inputSchema: Type.Object({}),
      execute: async () => noteActions.readBookNotes(book.id),
    }),
    append_book_note: defineTool({
      description:
        '用户要求添加或记录笔记时优先使用本工具。将新增 Markdown 内容原子追加到当前笔记区域，保留已有正文；没有笔记时自动创建。仅传入新增内容，不要重复整篇笔记。',
      inputSchema: Type.Object({
        content: Type.String({
          minLength: 1,
          maxLength: 100_000,
          description: '新增的 Markdown 笔记内容',
        }),
      }),
      execute: async ({ content }) => noteActions.appendBookNote(book.id, book.title, content),
    }),
    create_book_note: defineTool({
      description:
        '仅在用户明确要求写入笔记、且 read_book_notes 确认当前书籍没有笔记时，新建 Markdown 阅读笔记。已有笔记时追加内容必须改用 append_book_note，明确要求修改原文时使用 update_book_note。',
      inputSchema: Type.Object({
        content: Type.String({
          minLength: 1,
          maxLength: 100_000,
          description: '要保存的完整 Markdown 笔记正文',
        }),
      }),
      execute: async ({ content }) => noteActions.createBookNote(book.id, book.title, content),
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
        noteActions.updateBookNote(book.id, note_id, expected_updated_at, content),
    }),
    read_book_highlights: defineTool({
      description: '读取当前书籍的高亮、评论与术语释义。',
      inputSchema: Type.Object({}),
      execute: async () =>
        highlights.slice(0, 80).map((item) => ({
          kind: item.kind ?? 'highlight',
          text: item.text,
          chapter: item.chapter,
          page: item.page,
          comment: item.comment,
          definition: item.definition,
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
      execute: async ({ query, max_results }) => searchBookContent(book, query, max_results ?? 6),
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
      execute: async ({ passage_id }) => readBookPassage(book, passage_id),
    }),
    ...webTools,
  };
}

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import type { TocItem } from '../../contracts/books.js';
import type { MindMapNode, ChapterVideoScene } from '../../contracts/reading.js';
import type { AiDialogueContentItem, AiProvider, AiReasoningEffort } from '../../contracts/ai.js';

export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull().default('epub'),
  title: text('title').notNull().default(''),
  author: text('author').notNull().default(''),
  fileName: text('file_name').notNull().default(''),
  fileSize: integer('file_size').notNull().default(0),
  coverDataUrl: text('cover_data_url'),
  createdAt: integer('created_at').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(0),
  pinnedAt: integer('pinned_at'),
  archivedAt: integer('archived_at'),
  archiveUpdatedAt: integer('archive_updated_at'),
  progress: real('progress').notNull().default(0),
  currentCfi: text('current_cfi'),
  currentChapter: text('current_chapter').notNull().default(''),
  currentPage: integer('current_page'),
  totalPages: integer('total_pages'),
  toc: text('toc', { mode: 'json' }).$type<TocItem[]>().notNull().default([]),
  deletedAt: integer('deleted_at'),
});

export const bookLists = sqliteTable('book_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  note: text('note').notNull().default(''),
  bookIds: text('book_ids', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const trashedBooks = sqliteTable('trashed_books', {
  bookId: text('book_id').primaryKey(),
  book: text('book', { mode: 'json' }).notNull(),
  deletedAt: integer('deleted_at').notNull(),
  bookListPositions: text('book_list_positions', { mode: 'json' })
    .$type<Array<{ bookListId: string; index: number }>>()
    .notNull(),
});

export const deletedBookTombstones = sqliteTable('deleted_book_tombstones', {
  bookId: text('book_id').primaryKey(),
  deletedAt: integer('deleted_at').notNull(),
});

export const highlights = sqliteTable('highlights', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  kind: text('kind'),
  definition: text('definition'),
  text: text('text').notNull().default(''),
  cfi: text('cfi').notNull().default(''),
  chapter: text('chapter').notNull().default(''),
  page: integer('page'),
  comment: text('comment'),
  commentUpdatedAt: integer('comment_updated_at'),
  createdAt: integer('created_at').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(0),
});

export const deletedHighlightTombstones = sqliteTable('deleted_highlight_tombstones', {
  highlightId: text('highlight_id').primaryKey(),
  bookId: text('book_id').notNull(),
  deletedAt: integer('deleted_at').notNull(),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''),
  fileName: text('file_name'),
  contentFile: text('content_file'),
  createdAt: integer('created_at').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(0),
});

export const deletedNoteTombstones = sqliteTable('deleted_note_tombstones', {
  noteId: text('note_id').primaryKey(),
  bookId: text('book_id').notNull(),
  deletedAt: integer('deleted_at').notNull(),
});

export const readingSessions = sqliteTable('reading_sessions', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  startedAt: integer('started_at').notNull().default(0),
  endedAt: integer('ended_at').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
});

export const chapterMindMaps = sqliteTable('chapter_mind_maps', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().default(1),
  revision: integer('revision').notNull().default(1),
  bookId: text('book_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  chapterTitle: text('chapter_title').notNull(),
  nodes: text('nodes', { mode: 'json' }).$type<MindMapNode[]>().notNull(),
  model: text('model').notNull(),
  generatedAt: integer('generated_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chapterVideos = sqliteTable('chapter_videos', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().default(1),
  bookId: text('book_id').notNull(),
  chapterId: text('chapter_id'),
  chapterTitle: text('chapter_title').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  coverage: text('coverage', { mode: 'json' }).$type<
    Array<{ title: string; sceneIndexes: number[] }>
  >(),
  scenes: text('scenes', { mode: 'json' }).$type<ChapterVideoScene[]>().notNull(),
  durationSeconds: real('duration_seconds').notNull().default(0),
  hasAudio: integer('has_audio', { mode: 'boolean' }).notNull().default(false),
  model: text('model').notNull(),
  generatedAt: integer('generated_at').notNull(),
});

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  title: text('title').notNull(),
  provider: text('provider').$type<AiProvider>(),
  model: text('model'),
  reasoningEffort: text('reasoning_effort').$type<AiReasoningEffort>(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull().default(''),
  dialogueContent: text('dialogue_content', { mode: 'json' }).$type<AiDialogueContentItem[]>(),
  readAt: integer('read_at'),
  quote: text('quote', { mode: 'json' }).$type<{ text: string; chapter: string }>(),
  createdAt: integer('created_at').notNull(),
});

export const conversationDrafts = sqliteTable('conversation_drafts', {
  resourceId: text('resource_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  text: text('text').notNull().default(''),
  updatedAt: integer('updated_at').notNull(),
});

export const openAiConfigs = sqliteTable('openai_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  baseUrl: text('base_url').notNull().default(''),
  apiKey: text('api_key').notNull().default(''),
  models: text('models', { mode: 'json' }).$type<string[]>().notNull().default([]),
  oauthProvider: text('oauth_provider'),
  createdAt: integer('created_at').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(0),
});

export const keyValues = sqliteTable('key_values', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

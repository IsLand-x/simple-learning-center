import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DB_FILE, STATE_FILE } from '../config.js';
import { initDatabase } from './index.js';
import * as schema from './schema.js';
import { sql } from 'drizzle-orm';
import type {
  BookItem,
  BookList,
  DeletedBookTombstone,
  TrashedBookItem,
} from '../../contracts/books.js';
import type {
  ChapterMindMap,
  ChapterVideo,
  DeletedHighlightTombstone,
  DeletedNoteTombstone,
  HighlightItem,
  NoteItem,
  ReadingSession,
} from '../../contracts/reading.js';
import type {
  ChatMessage,
  ChatSession,
  ConversationDraft,
  OpenAICompatibleConfig,
} from '../../contracts/ai.js';

interface StateJsonFormat {
  formatVersion?: number;
  updatedAt?: string;
  persistedState?: {
    version?: number;
    deletedConversationIds?: string[];
    state?: Record<string, unknown>;
  };
  version?: number;
  deletedConversationIds?: string[];
  state?: Record<string, unknown>;
}

export async function migrateFromStateJson(
  stateFilePath: string = STATE_FILE,
  dbFilePath: string = DB_FILE,
) {
  if (!existsSync(stateFilePath)) {
    return { migrated: false, reason: 'state_file_not_found' };
  }

  const { db, sqlite } = initDatabase(dbFilePath);

  // Check if database already has data
  const hasVersion = db
    .select()
    .from(schema.keyValues)
    .where(sql`${schema.keyValues.key} = 'version'`)
    .get();
  const bookCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.books)
      .get()?.count ?? 0;

  if (hasVersion || bookCount > 0) {
    return { migrated: false, reason: 'database_already_has_data' };
  }

  const content = await readFile(stateFilePath, 'utf8');
  let parsed: StateJsonFormat;
  try {
    parsed = JSON.parse(content) as StateJsonFormat;
  } catch (error) {
    return { migrated: false, reason: 'invalid_json', error };
  }

  const persistedState = parsed.formatVersion === 1 ? parsed.persistedState : parsed;
  if (!persistedState || typeof persistedState !== 'object') {
    return { migrated: false, reason: 'invalid_persisted_state' };
  }

  const state = (persistedState.state ?? {}) as Record<string, unknown>;
  const version = Number.isInteger(persistedState.version)
    ? (persistedState.version as number)
    : 42;
  const deletedConversationIds = Array.isArray(persistedState.deletedConversationIds)
    ? persistedState.deletedConversationIds
    : [];

  const migrateTx = sqlite.transaction(() => {
    // 1. Version and deletedConversationIds
    db.insert(schema.keyValues)
      .values({ key: 'version', value: JSON.stringify(version) })
      .run();
    db.insert(schema.keyValues)
      .values({
        key: 'deletedConversationIds',
        value: JSON.stringify(deletedConversationIds),
      })
      .run();

    // 2. Preferences and scalar/json settings
    const kvKeys = [
      'webSearchConfig',
      'aiPreferences',
      'navCollapsed',
      'themeMode',
      'readerPreferences',
      'readerPreferencesUpdatedAt',
      'readerStyleUpdatedAt',
      'readerLayoutUpdatedAt',
      'rssFolders',
      'rssFeeds',
      'rssItems',
      'rssAnnotations',
      'rssDailyDigests',
      'rssDigestRuns',
      'rssDigestSettings',
      'rssPanelWidth',
      'videoResources',
      'videoTimestampNotes',
      'videoPanelWidth',
    ];

    for (const key of kvKeys) {
      if (Object.hasOwn(state, key) && state[key] !== undefined) {
        db.insert(schema.keyValues)
          .values({ key, value: JSON.stringify(state[key]) })
          .run();
      }
    }

    // 3. Books
    if (Array.isArray(state.books)) {
      for (const item of state.books as Array<BookItem & { deletedAt?: number }>) {
        if (!item?.id) continue;
        db.insert(schema.books)
          .values({
            id: item.id,
            kind: item.kind ?? 'demo',
            title: item.title ?? '',
            author: item.author ?? '',
            fileName: item.fileName ?? '',
            fileSize: item.fileSize ?? 0,
            coverDataUrl: item.coverDataUrl ?? null,
            createdAt: item.createdAt ?? Date.now(),
            updatedAt: item.updatedAt ?? Date.now(),
            pinnedAt: item.pinnedAt ?? null,
            archivedAt: item.archivedAt ?? null,
            archiveUpdatedAt: item.archiveUpdatedAt ?? null,
            progress: item.progress ?? 0,
            currentCfi: item.currentCfi ?? null,
            currentChapter: item.currentChapter ?? '',
            currentPage: item.currentPage ?? null,
            totalPages: item.totalPages ?? null,
            toc: item.toc ?? [],
            deletedAt: item.deletedAt ?? null,
          })
          .run();
      }
    }

    // 4. BookLists
    if (Array.isArray(state.bookLists)) {
      for (const item of state.bookLists as BookList[]) {
        if (!item?.id) continue;
        db.insert(schema.bookLists)
          .values({
            id: item.id,
            name: item.name ?? '',
            note: item.note ?? '',
            bookIds: item.bookIds ?? [],
            createdAt: item.createdAt ?? Date.now(),
            updatedAt: item.updatedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 5. TrashedBooks
    if (Array.isArray(state.trashedBooks)) {
      for (const item of state.trashedBooks as TrashedBookItem[]) {
        if (!item?.book?.id) continue;
        db.insert(schema.trashedBooks)
          .values({
            bookId: item.book.id,
            book: item.book,
            deletedAt: item.deletedAt ?? Date.now(),
            bookListPositions: item.bookListPositions ?? [],
          })
          .run();
      }
    }

    // 6. DeletedBookTombstones
    if (Array.isArray(state.deletedBookTombstones)) {
      for (const item of state.deletedBookTombstones as DeletedBookTombstone[]) {
        if (!item?.bookId) continue;
        db.insert(schema.deletedBookTombstones)
          .values({
            bookId: item.bookId,
            deletedAt: item.deletedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 7. Highlights
    if (Array.isArray(state.highlights)) {
      for (const item of state.highlights as HighlightItem[]) {
        if (!item?.id) continue;
        db.insert(schema.highlights)
          .values({
            id: item.id,
            bookId: item.bookId,
            kind: item.kind ?? null,
            definition: item.definition ?? null,
            text: item.text ?? '',
            cfi: item.cfi ?? '',
            chapter: item.chapter ?? '',
            page: item.page ?? null,
            comment: item.comment ?? null,
            commentUpdatedAt: item.commentUpdatedAt ?? null,
            createdAt: item.createdAt ?? Date.now(),
            updatedAt: item.updatedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 8. DeletedHighlightTombstones
    if (Array.isArray(state.deletedHighlightTombstones)) {
      for (const item of state.deletedHighlightTombstones as DeletedHighlightTombstone[]) {
        if (!item?.highlightId) continue;
        db.insert(schema.deletedHighlightTombstones)
          .values({
            highlightId: item.highlightId,
            bookId: item.bookId,
            deletedAt: item.deletedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 9. Notes
    if (Array.isArray(state.notes)) {
      for (const item of state.notes as Array<NoteItem & { contentFile?: string }>) {
        if (!item?.id) continue;
        db.insert(schema.notes)
          .values({
            id: item.id,
            bookId: item.bookId,
            title: item.title ?? '',
            content: item.content ?? '',
            fileName: item.fileName ?? null,
            contentFile: item.contentFile ?? null,
            createdAt: item.createdAt ?? Date.now(),
            updatedAt: item.updatedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 10. DeletedNoteTombstones
    if (Array.isArray(state.deletedNoteTombstones)) {
      for (const item of state.deletedNoteTombstones as DeletedNoteTombstone[]) {
        if (!item?.noteId) continue;
        db.insert(schema.deletedNoteTombstones)
          .values({
            noteId: item.noteId,
            bookId: item.bookId,
            deletedAt: item.deletedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 11. ReadingSessions
    if (Array.isArray(state.readingSessions)) {
      for (const item of state.readingSessions as ReadingSession[]) {
        if (!item?.id) continue;
        db.insert(schema.readingSessions)
          .values({
            id: item.id,
            bookId: item.bookId,
            startedAt: item.startedAt ?? Date.now(),
            endedAt: item.endedAt ?? Date.now(),
            durationMs: item.durationMs ?? 0,
          })
          .run();
      }
    }

    // 12. ChapterMindMaps
    if (Array.isArray(state.chapterMindMaps)) {
      for (const item of state.chapterMindMaps as ChapterMindMap[]) {
        if (!item?.id) continue;
        db.insert(schema.chapterMindMaps)
          .values({
            id: item.id,
            version: item.version ?? 1,
            revision: item.revision ?? 1,
            bookId: item.bookId,
            chapterId: item.chapterId,
            chapterTitle: item.chapterTitle ?? '',
            nodes: item.nodes ?? [],
            model: item.model ?? '',
            generatedAt: item.generatedAt ?? Date.now(),
            updatedAt: item.updatedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 13. ChapterVideos
    if (Array.isArray(state.chapterVideos)) {
      for (const item of state.chapterVideos as ChapterVideo[]) {
        if (!item?.id) continue;
        db.insert(schema.chapterVideos)
          .values({
            id: item.id,
            version: item.version ?? 1,
            bookId: item.bookId,
            chapterId: item.chapterId ?? null,
            chapterTitle: item.chapterTitle ?? '',
            title: item.title ?? '',
            summary: item.summary ?? '',
            coverage: item.coverage ?? null,
            scenes: item.scenes ?? [],
            durationSeconds: item.durationSeconds ?? 0,
            hasAudio: item.hasAudio ?? false,
            model: item.model ?? '',
            generatedAt: item.generatedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 14. ChatSessions
    if (Array.isArray(state.chatSessions)) {
      for (const item of state.chatSessions as ChatSession[]) {
        if (!item?.id) continue;
        db.insert(schema.chatSessions)
          .values({
            id: item.id,
            bookId: item.bookId,
            title: item.title ?? '',
            provider: item.provider ?? null,
            model: item.model ?? null,
            reasoningEffort: item.reasoningEffort ?? null,
            createdAt: item.createdAt ?? Date.now(),
            updatedAt: item.updatedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 15. Chats
    if (Array.isArray(state.chats)) {
      for (const item of state.chats as ChatMessage[]) {
        if (!item?.id) continue;
        db.insert(schema.chats)
          .values({
            id: item.id,
            bookId: item.bookId,
            conversationId: item.conversationId,
            role: item.role,
            content: item.content ?? '',
            dialogueContent: item.dialogueContent ?? null,
            readAt: item.readAt ?? null,
            quote: item.quote ?? null,
            createdAt: item.createdAt ?? Date.now(),
          })
          .run();
      }
    }

    // 16. ConversationDrafts
    if (Array.isArray(state.conversationDrafts)) {
      for (const item of state.conversationDrafts as ConversationDraft[]) {
        if (!item?.resourceId || !item?.conversationId) continue;
        db.insert(schema.conversationDrafts)
          .values({
            resourceId: item.resourceId,
            conversationId: item.conversationId,
            text: item.text ?? '',
            updatedAt: item.updatedAt ?? Date.now(),
          })
          .run();
      }
    }

    // 17. OpenAiConfigs
    if (Array.isArray(state.openAIConfigs)) {
      for (const item of state.openAIConfigs as OpenAICompatibleConfig[]) {
        if (!item?.id) continue;
        db.insert(schema.openAiConfigs)
          .values({
            id: item.id,
            name: item.name ?? '',
            baseUrl: item.baseUrl ?? '',
            apiKey: item.apiKey ?? '',
            models: item.models ?? [],
            oauthProvider: item.oauthProvider ?? null,
            createdAt: item.createdAt ?? Date.now(),
            updatedAt: item.updatedAt ?? Date.now(),
          })
          .run();
      }
    }
  });

  migrateTx();
  return { migrated: true };
}

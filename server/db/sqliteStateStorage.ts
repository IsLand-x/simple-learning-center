import { inArray, sql } from 'drizzle-orm';
import { getDatabase } from './index.js';
import * as schema from './schema.js';
import type { PersistedState, StoredState } from '../modules/state/types.js';
import type { BookItem } from '../../contracts/books.js';
import type { HighlightItem, NoteItem, ChapterVideo } from '../../contracts/reading.js';
import type {
  ChatMessage,
  OpenAICompatibleConfig,
  AiProvider,
  AiReasoningEffort,
} from '../../contracts/ai.js';

export function writeStateToDb(persisted: PersistedState, fields?: readonly (keyof StoredState)[]) {
  const { db, sqlite } = getDatabase();
  const state = persisted.state;
  const shouldUpdateAll = !fields;
  const updates = (f: keyof StoredState) => shouldUpdateAll || fields?.includes(f);

  sqlite.transaction(() => {
    if (shouldUpdateAll) {
      db.delete(schema.keyValues).run();
    }
    // Version & deletedConversationIds
    db.insert(schema.keyValues)
      .values({ key: 'version', value: String(persisted.version) })
      .onConflictDoUpdate({
        target: schema.keyValues.key,
        set: { value: String(persisted.version) },
      })
      .run();

    if (persisted.deletedConversationIds) {
      db.insert(schema.keyValues)
        .values({
          key: 'deletedConversationIds',
          value: JSON.stringify(persisted.deletedConversationIds),
        })
        .onConflictDoUpdate({
          target: schema.keyValues.key,
          set: { value: JSON.stringify(persisted.deletedConversationIds) },
        })
        .run();
    }

    if (updates('books') && state.books) {
      db.delete(schema.books).run();
      if (state.books.length > 0) {
        const normalizedBooks = state.books.map((b) => ({
          id: b.id,
          kind: b.kind ?? 'epub',
          title: b.title ?? '',
          author: b.author ?? '',
          fileName: b.fileName ?? '',
          fileSize: b.fileSize ?? 0,
          coverDataUrl: b.coverDataUrl,
          createdAt: b.createdAt ?? 0,
          updatedAt: b.updatedAt ?? 0,
          pinnedAt: b.pinnedAt,
          archivedAt: b.archivedAt,
          archiveUpdatedAt: b.archiveUpdatedAt,
          progress: b.progress ?? 0,
          currentCfi: b.currentCfi,
          currentChapter: b.currentChapter ?? '',
          currentPage: b.currentPage,
          totalPages: b.totalPages,
          toc: b.toc ?? [],
          deletedAt: b.deletedAt,
        }));
        db.insert(schema.books).values(normalizedBooks).run();
      }
    }

    if (updates('bookLists') && state.bookLists) {
      db.delete(schema.bookLists).run();
      if (state.bookLists.length > 0) {
        const rows = state.bookLists.map((l) => ({
          id: l.id,
          name: l.name,
          note: l.note ?? '',
          bookIds: l.bookIds,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        }));
        db.insert(schema.bookLists).values(rows).run();
      }
    }

    if (updates('trashedBooks') && state.trashedBooks) {
      db.delete(schema.trashedBooks).run();
      if (state.trashedBooks.length > 0) {
        const rows = state.trashedBooks.map((t) => ({
          bookId: t.book.id,
          book: t.book,
          deletedAt: t.deletedAt,
          bookListPositions: t.bookListPositions,
        }));
        db.insert(schema.trashedBooks).values(rows).run();
      }
    }

    if (updates('deletedBookTombstones') && state.deletedBookTombstones) {
      db.delete(schema.deletedBookTombstones).run();
      if (state.deletedBookTombstones.length > 0) {
        const rows = state.deletedBookTombstones.map((t) => ({
          bookId: t.bookId,
          deletedAt: t.deletedAt,
        }));
        db.insert(schema.deletedBookTombstones).values(rows).run();
      }
    }

    if (updates('highlights') && state.highlights) {
      db.delete(schema.highlights).run();
      if (state.highlights.length > 0) {
        const normalizedHighlights = state.highlights.map((h) => ({
          id: h.id,
          bookId: h.bookId,
          kind: h.kind,
          definition: h.definition,
          text: h.text ?? '',
          cfi: h.cfi ?? '',
          chapter: h.chapter ?? '',
          page: h.page,
          comment: h.comment,
          commentUpdatedAt: h.commentUpdatedAt,
          createdAt: h.createdAt ?? 0,
          updatedAt: h.updatedAt,
        }));
        db.insert(schema.highlights).values(normalizedHighlights).run();
      }
    }

    if (updates('deletedHighlightTombstones') && state.deletedHighlightTombstones) {
      db.delete(schema.deletedHighlightTombstones).run();
      if (state.deletedHighlightTombstones.length > 0) {
        const rows = state.deletedHighlightTombstones.map((t) => ({
          highlightId: t.highlightId,
          bookId: t.bookId,
          deletedAt: t.deletedAt,
        }));
        db.insert(schema.deletedHighlightTombstones).values(rows).run();
      }
    }

    if (updates('notes') && state.notes) {
      db.delete(schema.notes).run();
      if (state.notes.length > 0) {
        const normalizedNotes = state.notes.map((n) => {
          const noteWithOptionalDiskFields = n as NoteItem & { contentFile?: string };
          return {
            id: n.id,
            bookId: n.bookId,
            title: n.title ?? '',
            content: n.content ?? '',
            fileName: n.fileName,
            contentFile: noteWithOptionalDiskFields.contentFile,
            createdAt: n.createdAt ?? 0,
            updatedAt: n.updatedAt ?? 0,
          };
        });
        db.insert(schema.notes).values(normalizedNotes).run();
      }
    }

    if (updates('deletedNoteTombstones') && state.deletedNoteTombstones) {
      db.delete(schema.deletedNoteTombstones).run();
      if (state.deletedNoteTombstones.length > 0) {
        const rows = state.deletedNoteTombstones.map((t) => ({
          noteId: t.noteId,
          bookId: t.bookId,
          deletedAt: t.deletedAt,
        }));
        db.insert(schema.deletedNoteTombstones).values(rows).run();
      }
    }

    if (updates('readingSessions') && state.readingSessions) {
      db.delete(schema.readingSessions).run();
      if (state.readingSessions.length > 0) {
        const normalizedSessions = state.readingSessions.map((s) => ({
          id: s.id,
          bookId: s.bookId,
          startedAt: s.startedAt ?? 0,
          endedAt: s.endedAt ?? 0,
          durationMs: s.durationMs ?? 0,
        }));
        db.insert(schema.readingSessions).values(normalizedSessions).run();
      }
    }

    if (updates('chapterMindMaps') && state.chapterMindMaps) {
      db.delete(schema.chapterMindMaps).run();
      if (state.chapterMindMaps.length > 0) {
        const rows = state.chapterMindMaps.map((m) => ({
          id: m.id,
          version: m.version ?? 1,
          revision: m.revision ?? 1,
          bookId: m.bookId,
          chapterId: m.chapterId,
          chapterTitle: m.chapterTitle,
          nodes: m.nodes,
          model: m.model,
          generatedAt: m.generatedAt,
          updatedAt: m.updatedAt,
        }));
        db.insert(schema.chapterMindMaps).values(rows).run();
      }
    }

    if (updates('chapterVideos') && state.chapterVideos) {
      db.delete(schema.chapterVideos).run();
      if (state.chapterVideos.length > 0) {
        const rows = state.chapterVideos.map((v) => ({
          id: v.id,
          version: v.version ?? 1,
          bookId: v.bookId,
          chapterId: v.chapterId,
          chapterTitle: v.chapterTitle,
          title: v.title,
          summary: v.summary ?? '',
          coverage: v.coverage,
          scenes: v.scenes,
          durationSeconds: v.durationSeconds ?? 0,
          hasAudio: v.hasAudio ?? false,
          model: v.model,
          generatedAt: v.generatedAt,
        }));
        db.insert(schema.chapterVideos).values(rows).run();
      }
    }

    if (updates('chatSessions') && state.chatSessions) {
      db.delete(schema.chatSessions).run();
      if (state.chatSessions.length > 0) {
        const rows = state.chatSessions.map((s) => ({
          id: s.id,
          bookId: s.bookId,
          title: s.title,
          provider: s.provider,
          model: s.model,
          reasoningEffort: s.reasoningEffort,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));
        db.insert(schema.chatSessions).values(rows).run();
      }
    }

    if (updates('chats') && state.chats) {
      db.delete(schema.chats).run();
      if (state.chats.length > 0) {
        const rows = state.chats.map((c) => ({
          id: c.id,
          bookId: c.bookId,
          conversationId: c.conversationId,
          role: c.role,
          content: c.content ?? '',
          dialogueContent: c.dialogueContent,
          readAt: c.readAt,
          quote: c.quote,
          createdAt: c.createdAt,
        }));
        db.insert(schema.chats).values(rows).run();
      }
    }

    if (updates('conversationDrafts') && state.conversationDrafts) {
      db.delete(schema.conversationDrafts).run();
      if (state.conversationDrafts.length > 0) {
        const rows = state.conversationDrafts.map((d) => ({
          resourceId: d.resourceId,
          conversationId: d.conversationId,
          text: d.text ?? '',
          updatedAt: d.updatedAt,
        }));
        db.insert(schema.conversationDrafts).values(rows).run();
      }
    }

    if (updates('openAIConfigs') && state.openAIConfigs) {
      db.delete(schema.openAiConfigs).run();
      if (state.openAIConfigs.length > 0) {
        const rows = state.openAIConfigs.map((cfg) => ({
          id: cfg.id,
          name: cfg.name ?? '',
          baseUrl: cfg.baseUrl ?? '',
          apiKey: cfg.apiKey ?? '',
          models: cfg.models ?? [],
          oauthProvider: cfg.oauthProvider,
          createdAt: cfg.createdAt,
          updatedAt: cfg.updatedAt,
        }));
        db.insert(schema.openAiConfigs).values(rows).run();
      }
    }

    // Key-value settings
    const saveKv = (key: string, val: unknown) => {
      db.insert(schema.keyValues)
        .values({ key, value: JSON.stringify(val) })
        .onConflictDoUpdate({ target: schema.keyValues.key, set: { value: JSON.stringify(val) } })
        .run();
    };

    if (updates('webSearchConfig') && state.webSearchConfig !== undefined) {
      saveKv('webSearchConfig', state.webSearchConfig);
    }
    if (updates('aiPreferences') && state.aiPreferences !== undefined) {
      saveKv('aiPreferences', state.aiPreferences);
    }
    if (updates('navCollapsed') && state.navCollapsed !== undefined) {
      saveKv('navCollapsed', state.navCollapsed);
    }
    if (updates('themeMode') && state.themeMode !== undefined) {
      saveKv('themeMode', state.themeMode);
    }
    if (updates('readerPreferences') && state.readerPreferences !== undefined) {
      saveKv('readerPreferences', state.readerPreferences);
    }
    if (updates('readerPreferencesUpdatedAt') && state.readerPreferencesUpdatedAt !== undefined) {
      saveKv('readerPreferencesUpdatedAt', state.readerPreferencesUpdatedAt);
    }
    if (updates('readerStyleUpdatedAt') && state.readerStyleUpdatedAt !== undefined) {
      saveKv('readerStyleUpdatedAt', state.readerStyleUpdatedAt);
    }
    if (updates('readerLayoutUpdatedAt') && state.readerLayoutUpdatedAt !== undefined) {
      saveKv('readerLayoutUpdatedAt', state.readerLayoutUpdatedAt);
    }
    // Track stored fields
    let storedFieldsSet = new Set<string>();
    if (!shouldUpdateAll) {
      const storedFieldsRow = db
        .select()
        .from(schema.keyValues)
        .where(sql`${schema.keyValues.key} = '__storedFields'`)
        .get();
      if (storedFieldsRow?.value) {
        try {
          storedFieldsSet = new Set(JSON.parse(storedFieldsRow.value));
        } catch {
          // Ignore malformed JSON
        }
      }
      if (fields) {
        for (const f of fields) {
          if (Object.hasOwn(state, f)) {
            storedFieldsSet.add(String(f));
          } else {
            storedFieldsSet.delete(String(f));
          }
        }
      }
    } else {
      storedFieldsSet = new Set(Object.keys(state));
    }
    saveKv('__storedFields', [...storedFieldsSet]);
  })();
}
export function readStateFromDb(fields?: readonly (keyof StoredState)[]): PersistedState | null {
  const { db } = getDatabase();
  const shouldRead = (f: keyof StoredState) => !fields || fields.includes(f);
  const storedFieldsRow = db
    .select()
    .from(schema.keyValues)
    .where(sql`${schema.keyValues.key} = '__storedFields'`)
    .get();
  let storedFieldsSet: Set<string> | undefined;
  if (storedFieldsRow?.value) {
    try {
      storedFieldsSet = new Set(JSON.parse(storedFieldsRow.value));
    } catch {
      // Ignore malformed JSON
    }
  }
  const shouldInclude = (f: keyof StoredState) =>
    shouldRead(f) && (!storedFieldsSet || storedFieldsSet.has(String(f)));

  const versionRow = db
    .select()
    .from(schema.keyValues)
    .where(sql`${schema.keyValues.key} = 'version'`)
    .get();

  if (!versionRow) {
    const hasAnyBook = db.select({ id: schema.books.id }).from(schema.books).limit(1).get();
    if (!hasAnyBook) return null;
  }

  const version = versionRow ? Number(versionRow.value) : 42;

  let deletedConversationIds: string[] | undefined;
  const delRow = db
    .select()
    .from(schema.keyValues)
    .where(sql`${schema.keyValues.key} = 'deletedConversationIds'`)
    .get();
  if (delRow?.value) {
    try {
      deletedConversationIds = JSON.parse(delRow.value);
    } catch {
      // Ignore malformed JSON
    }
  }

  const state: StoredState = {};

  if (shouldInclude('books')) {
    const rows = db.select().from(schema.books).all();
    state.books = rows.map((b) => ({
      id: b.id,
      kind: (b.kind as BookItem['kind']) ?? 'epub',
      title: b.title,
      author: b.author,
      fileName: b.fileName,
      fileSize: b.fileSize,
      coverDataUrl: b.coverDataUrl ?? undefined,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      pinnedAt: b.pinnedAt ?? undefined,
      archivedAt: b.archivedAt ?? undefined,
      archiveUpdatedAt: b.archiveUpdatedAt ?? undefined,
      progress: b.progress,
      currentCfi: b.currentCfi ?? undefined,
      currentChapter: b.currentChapter,
      currentPage: b.currentPage ?? undefined,
      totalPages: b.totalPages ?? undefined,
      toc: b.toc ?? [],
      deletedAt: b.deletedAt ?? undefined,
    }));
  }

  if (shouldInclude('bookLists')) {
    const rows = db.select().from(schema.bookLists).all();
    state.bookLists = rows.map((l) => ({
      id: l.id,
      name: l.name,
      note: l.note ?? undefined,
      bookIds: (l.bookIds as string[]) ?? [],
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  }

  if (shouldInclude('trashedBooks')) {
    const rows = db.select().from(schema.trashedBooks).all();
    state.trashedBooks = rows.map((t) => ({
      book: t.book as unknown as BookItem,
      deletedAt: t.deletedAt,
      bookListPositions: t.bookListPositions,
    }));
  }

  if (shouldInclude('deletedBookTombstones')) {
    const rows = db.select().from(schema.deletedBookTombstones).all();
    state.deletedBookTombstones = rows.map((t) => ({
      bookId: t.bookId,
      deletedAt: t.deletedAt,
    }));
  }

  if (shouldInclude('highlights')) {
    const rows = db.select().from(schema.highlights).all();
    state.highlights = rows.map((h) => ({
      id: h.id,
      bookId: h.bookId,
      kind: (h.kind as HighlightItem['kind']) ?? undefined,
      definition: h.definition ?? undefined,
      text: h.text,
      cfi: h.cfi,
      chapter: h.chapter,
      page: h.page ?? undefined,
      comment: h.comment ?? undefined,
      commentUpdatedAt: h.commentUpdatedAt ?? undefined,
      createdAt: h.createdAt,
      updatedAt: (h.updatedAt ?? undefined) as number,
    }));
  }

  if (shouldInclude('deletedHighlightTombstones')) {
    const rows = db.select().from(schema.deletedHighlightTombstones).all();
    state.deletedHighlightTombstones = rows.map((t) => ({
      highlightId: t.highlightId,
      bookId: t.bookId,
      deletedAt: t.deletedAt,
    }));
  }

  if (shouldInclude('notes')) {
    const rows = db.select().from(schema.notes).all();
    state.notes = rows.map((n) => ({
      id: n.id,
      bookId: n.bookId,
      title: n.title,
      content: n.content,
      fileName: n.fileName ?? undefined,
      contentFile: n.contentFile ?? undefined,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })) as unknown as NoteItem[];
  }

  if (shouldInclude('deletedNoteTombstones')) {
    const rows = db.select().from(schema.deletedNoteTombstones).all();
    state.deletedNoteTombstones = rows.map((t) => ({
      noteId: t.noteId,
      bookId: t.bookId,
      deletedAt: t.deletedAt,
    }));
  }

  if (shouldInclude('readingSessions')) {
    const rows = db.select().from(schema.readingSessions).all();
    state.readingSessions = rows.map((s) => ({
      id: s.id,
      bookId: s.bookId,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMs: s.durationMs,
    }));
  }

  if (shouldInclude('chapterMindMaps')) {
    const rows = db.select().from(schema.chapterMindMaps).all();
    state.chapterMindMaps = rows.map((m) => ({
      id: m.id,
      version: 1 as const,
      revision: m.revision,
      bookId: m.bookId,
      chapterId: m.chapterId,
      chapterTitle: m.chapterTitle,
      nodes: m.nodes ?? [],
      model: m.model ?? undefined,
      generatedAt: m.generatedAt,
      updatedAt: m.updatedAt,
    }));
  }

  if (shouldInclude('chapterVideos')) {
    const rows = db.select().from(schema.chapterVideos).all();
    state.chapterVideos = rows.map((v) => ({
      id: v.id,
      version: 1 as const,
      bookId: v.bookId,
      chapterId: v.chapterId ?? undefined,
      chapterTitle: v.chapterTitle,
      title: v.title,
      summary: v.summary,
      coverage: v.coverage ?? undefined,
      scenes: v.scenes ?? [],
      durationSeconds: v.durationSeconds,
      hasAudio: v.hasAudio,
      model: (v.model as unknown as ChapterVideo['model']) ?? undefined,
      generatedAt: v.generatedAt,
    }));
  }

  if (shouldInclude('chatSessions')) {
    const rows = db.select().from(schema.chatSessions).all();
    state.chatSessions = rows.map((s) => ({
      id: s.id,
      bookId: s.bookId,
      title: s.title,
      provider: (s.provider as AiProvider) ?? undefined,
      model: s.model ?? undefined,
      reasoningEffort: (s.reasoningEffort as AiReasoningEffort) ?? undefined,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  if (shouldInclude('chats')) {
    const rows = db.select().from(schema.chats).all();
    state.chats = rows.map((c) => ({
      id: c.id,
      bookId: c.bookId,
      conversationId: c.conversationId,
      role: c.role as ChatMessage['role'],
      content: c.content,
      dialogueContent: c.dialogueContent ?? undefined,
      readAt: c.readAt ?? undefined,
      quote: c.quote ?? undefined,
      createdAt: c.createdAt,
    }));
  }

  if (shouldInclude('conversationDrafts')) {
    const rows = db.select().from(schema.conversationDrafts).all();
    state.conversationDrafts = rows.map((d) => ({
      resourceId: d.resourceId,
      conversationId: d.conversationId,
      text: d.text,
      updatedAt: d.updatedAt,
    }));
  }

  if (shouldInclude('openAIConfigs')) {
    const rows = db.select().from(schema.openAiConfigs).all();
    state.openAIConfigs = rows.map((cfg) => ({
      id: cfg.id,
      name: cfg.name,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      models: cfg.models ?? [],
      oauthProvider: (cfg.oauthProvider as OpenAICompatibleConfig['oauthProvider']) ?? undefined,
      createdAt: cfg.createdAt,
      updatedAt: cfg.updatedAt,
    }));
  }

  const kvKeys = [
    'webSearchConfig',
    'aiPreferences',
    'navCollapsed',
    'themeMode',
    'readerPreferences',
    'readerPreferencesUpdatedAt',
    'readerStyleUpdatedAt',
    'readerLayoutUpdatedAt',
  ].filter((k) => shouldInclude(k as keyof StoredState));

  if (kvKeys.length > 0) {
    const kvRows = db
      .select()
      .from(schema.keyValues)
      .where(inArray(schema.keyValues.key, kvKeys))
      .all();
    for (const row of kvRows) {
      try {
        state[row.key as keyof StoredState] = JSON.parse(row.value);
      } catch {
        // Ignore malformed JSON
      }
    }
  }

  return {
    version,
    ...(deletedConversationIds ? { deletedConversationIds } : {}),
    state,
  };
}

import { inArray, sql } from 'drizzle-orm';
import { getDatabase, type AppDatabase } from './index.js';
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

const TABLE_BACKED_FIELDS: Record<string, true> = {
  books: true,
  bookLists: true,
  trashedBooks: true,
  deletedBookTombstones: true,
  highlights: true,
  deletedHighlightTombstones: true,
  notes: true,
  deletedNoteTombstones: true,
  readingSessions: true,
  chapterMindMaps: true,
  chapterVideos: true,
  chatSessions: true,
  chats: true,
  conversationDrafts: true,
  openAIConfigs: true,
};

const RESERVED_KV_KEYS: Record<string, true> = {
  version: true,
  deletedConversationIds: true,
  __storedFields: true,
};

function inferExistingStoredFields(db: AppDatabase): Set<string> {
  const inferred = new Set<string>();
  const checkTable = (field: string, table: unknown) => {
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(table as typeof schema.books)
      .get();
    if ((row?.count ?? 0) > 0) inferred.add(field);
  };
  checkTable('books', schema.books);
  checkTable('bookLists', schema.bookLists);
  checkTable('trashedBooks', schema.trashedBooks);
  checkTable('deletedBookTombstones', schema.deletedBookTombstones);
  checkTable('highlights', schema.highlights);
  checkTable('deletedHighlightTombstones', schema.deletedHighlightTombstones);
  checkTable('notes', schema.notes);
  checkTable('deletedNoteTombstones', schema.deletedNoteTombstones);
  checkTable('readingSessions', schema.readingSessions);
  checkTable('chapterMindMaps', schema.chapterMindMaps);
  checkTable('chapterVideos', schema.chapterVideos);
  checkTable('chatSessions', schema.chatSessions);
  checkTable('chats', schema.chats);
  checkTable('conversationDrafts', schema.conversationDrafts);
  checkTable('openAIConfigs', schema.openAiConfigs);

  const kvRows = db.select({ key: schema.keyValues.key }).from(schema.keyValues).all();
  for (const row of kvRows) {
    if (!RESERVED_KV_KEYS[row.key]) {
      inferred.add(row.key);
    }
  }
  return inferred;
}

export function writeStateToDb(
  persisted: PersistedState,
  fields?: readonly (keyof StoredState)[],
  noteContents?: ReadonlyMap<string, string>,
) {
  const { db, sqlite } = getDatabase();
  const state = persisted.state;
  const shouldUpdateAll = !fields;
  const updates = (f: keyof StoredState) => shouldUpdateAll || fields?.includes(f);

  sqlite.transaction(() => {
    let existingStoredFields: Set<string> | undefined;
    if (!shouldUpdateAll) {
      const storedFieldsRow = db
        .select()
        .from(schema.keyValues)
        .where(sql`${schema.keyValues.key} = '__storedFields'`)
        .get();
      if (storedFieldsRow?.value) {
        try {
          existingStoredFields = new Set(JSON.parse(storedFieldsRow.value));
        } catch {
          // Ignore malformed JSON
        }
      }
      if (!existingStoredFields) {
        existingStoredFields = inferExistingStoredFields(db);
      }
    }

    let existingNoteContents: Map<string, string> | undefined;
    if (updates('notes') && state.notes && !noteContents) {
      const needsExistingContent = state.notes.some(
        (n) => typeof (n as NoteItem).content !== 'string',
      );
      if (needsExistingContent) {
        const rows = db
          .select({ id: schema.notes.id, content: schema.notes.content })
          .from(schema.notes)
          .all();
        existingNoteContents = new Map(rows.map((r) => [r.id, r.content]));
      }
    }

    if (shouldUpdateAll) {
      db.delete(schema.keyValues).run();
    }

    const saveKv = (key: string, val: unknown) => {
      const serialized = JSON.stringify(val);
      db.insert(schema.keyValues)
        .values({ key, value: serialized })
        .onConflictDoUpdate({ target: schema.keyValues.key, set: { value: serialized } })
        .run();
    };

    // Version & deletedConversationIds
    db.insert(schema.keyValues)
      .values({ key: 'version', value: String(persisted.version) })
      .onConflictDoUpdate({
        target: schema.keyValues.key,
        set: { value: String(persisted.version) },
      })
      .run();

    if (persisted.deletedConversationIds) {
      saveKv('deletedConversationIds', persisted.deletedConversationIds);
    } else if (shouldUpdateAll) {
      db.delete(schema.keyValues)
        .where(sql`${schema.keyValues.key} = 'deletedConversationIds'`)
        .run();
    }

    if (updates('books')) {
      db.delete(schema.books).run();
      if (state.books && state.books.length > 0) {
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

    if (updates('bookLists')) {
      db.delete(schema.bookLists).run();
      if (state.bookLists && state.bookLists.length > 0) {
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

    if (updates('trashedBooks')) {
      db.delete(schema.trashedBooks).run();
      if (state.trashedBooks && state.trashedBooks.length > 0) {
        const rows = state.trashedBooks.map((t) => ({
          bookId: t.book.id,
          book: t.book,
          deletedAt: t.deletedAt,
          bookListPositions: t.bookListPositions,
        }));
        db.insert(schema.trashedBooks).values(rows).run();
      }
    }

    if (updates('deletedBookTombstones')) {
      db.delete(schema.deletedBookTombstones).run();
      if (state.deletedBookTombstones && state.deletedBookTombstones.length > 0) {
        const rows = state.deletedBookTombstones.map((t) => ({
          bookId: t.bookId,
          deletedAt: t.deletedAt,
        }));
        db.insert(schema.deletedBookTombstones).values(rows).run();
      }
    }

    if (updates('highlights')) {
      db.delete(schema.highlights).run();
      if (state.highlights && state.highlights.length > 0) {
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

    if (updates('deletedHighlightTombstones')) {
      db.delete(schema.deletedHighlightTombstones).run();
      if (state.deletedHighlightTombstones && state.deletedHighlightTombstones.length > 0) {
        const rows = state.deletedHighlightTombstones.map((t) => ({
          highlightId: t.highlightId,
          bookId: t.bookId,
          deletedAt: t.deletedAt,
        }));
        db.insert(schema.deletedHighlightTombstones).values(rows).run();
      }
    }

    if (updates('notes')) {
      db.delete(schema.notes).run();
      if (state.notes && state.notes.length > 0) {
        const normalizedNotes = state.notes.map((n) => {
          const noteWithOptionalDiskFields = n as NoteItem & { contentFile?: string };
          const resolvedContent =
            typeof n.content === 'string'
              ? n.content
              : (noteContents?.get(n.id) ?? existingNoteContents?.get(n.id) ?? '');
          return {
            id: n.id,
            bookId: n.bookId,
            title: n.title ?? '',
            content: resolvedContent,
            fileName: n.fileName,
            contentFile: noteWithOptionalDiskFields.contentFile,
            createdAt: n.createdAt ?? 0,
            updatedAt: n.updatedAt ?? 0,
          };
        });
        db.insert(schema.notes).values(normalizedNotes).run();
      }
    }

    if (updates('deletedNoteTombstones')) {
      db.delete(schema.deletedNoteTombstones).run();
      if (state.deletedNoteTombstones && state.deletedNoteTombstones.length > 0) {
        const rows = state.deletedNoteTombstones.map((t) => ({
          noteId: t.noteId,
          bookId: t.bookId,
          deletedAt: t.deletedAt,
        }));
        db.insert(schema.deletedNoteTombstones).values(rows).run();
      }
    }

    if (updates('readingSessions')) {
      db.delete(schema.readingSessions).run();
      if (state.readingSessions && state.readingSessions.length > 0) {
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

    if (updates('chapterMindMaps')) {
      db.delete(schema.chapterMindMaps).run();
      if (state.chapterMindMaps && state.chapterMindMaps.length > 0) {
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

    if (updates('chapterVideos')) {
      db.delete(schema.chapterVideos).run();
      if (state.chapterVideos && state.chapterVideos.length > 0) {
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

    if (updates('chatSessions')) {
      db.delete(schema.chatSessions).run();
      if (state.chatSessions && state.chatSessions.length > 0) {
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

    if (updates('chats')) {
      db.delete(schema.chats).run();
      if (state.chats && state.chats.length > 0) {
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

    if (updates('conversationDrafts')) {
      db.delete(schema.conversationDrafts).run();
      if (state.conversationDrafts && state.conversationDrafts.length > 0) {
        const rows = state.conversationDrafts.map((d) => ({
          resourceId: d.resourceId,
          conversationId: d.conversationId,
          text: d.text ?? '',
          updatedAt: d.updatedAt,
        }));
        db.insert(schema.conversationDrafts).values(rows).run();
      }
    }

    if (updates('openAIConfigs')) {
      db.delete(schema.openAiConfigs).run();
      if (state.openAIConfigs && state.openAIConfigs.length > 0) {
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

    // Store all non-table scalar/JSON fields (preferences and any extra extension fields)
    const candidateKvKeys = shouldUpdateAll ? Object.keys(state) : (fields?.map(String) ?? []);
    for (const key of candidateKvKeys) {
      if (TABLE_BACKED_FIELDS[key] || RESERVED_KV_KEYS[key]) continue;
      if (Object.hasOwn(state, key) && state[key] !== undefined) {
        saveKv(key, state[key]);
      } else if (!shouldUpdateAll) {
        db.delete(schema.keyValues)
          .where(sql`${schema.keyValues.key} = ${key}`)
          .run();
      }
    }

    // Track stored fields
    let storedFieldsSet: Set<string>;
    if (!shouldUpdateAll) {
      storedFieldsSet = existingStoredFields ?? new Set<string>();
      if (fields) {
        for (const f of fields) {
          if (Object.hasOwn(state, f) && state[f] !== undefined) {
            storedFieldsSet.add(String(f));
          } else {
            storedFieldsSet.delete(String(f));
          }
        }
      }
    } else {
      storedFieldsSet = new Set(
        Object.keys(state).filter((k) => state[k] !== undefined && !RESERVED_KV_KEYS[k]),
      );
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
      ...(b.coverDataUrl ? { coverDataUrl: b.coverDataUrl } : {}),
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      ...(b.pinnedAt !== null && b.pinnedAt !== undefined ? { pinnedAt: b.pinnedAt } : {}),
      ...(b.archivedAt !== null && b.archivedAt !== undefined ? { archivedAt: b.archivedAt } : {}),
      ...(b.archiveUpdatedAt !== null && b.archiveUpdatedAt !== undefined
        ? { archiveUpdatedAt: b.archiveUpdatedAt }
        : {}),
      progress: b.progress,
      ...(b.currentCfi !== null && b.currentCfi !== undefined ? { currentCfi: b.currentCfi } : {}),
      currentChapter: b.currentChapter,
      ...(b.currentPage !== null && b.currentPage !== undefined
        ? { currentPage: b.currentPage }
        : {}),
      ...(b.totalPages !== null && b.totalPages !== undefined ? { totalPages: b.totalPages } : {}),
      toc: b.toc ?? [],
      ...(b.deletedAt !== null && b.deletedAt !== undefined ? { deletedAt: b.deletedAt } : {}),
    }));
  }

  if (shouldInclude('bookLists')) {
    const rows = db.select().from(schema.bookLists).all();
    state.bookLists = rows.map((l) => ({
      id: l.id,
      name: l.name,
      note: l.note ?? '',
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
      ...(h.kind ? { kind: h.kind as HighlightItem['kind'] } : {}),
      ...(h.definition !== null && h.definition !== undefined ? { definition: h.definition } : {}),
      text: h.text,
      cfi: h.cfi,
      chapter: h.chapter,
      ...(h.page !== null && h.page !== undefined ? { page: h.page } : {}),
      ...(h.comment !== null && h.comment !== undefined ? { comment: h.comment } : {}),
      ...(h.commentUpdatedAt !== null && h.commentUpdatedAt !== undefined
        ? { commentUpdatedAt: h.commentUpdatedAt }
        : {}),
      createdAt: h.createdAt,
      updatedAt: (h.updatedAt ?? h.createdAt) as number,
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
      ...(n.contentFile ? { contentFile: n.contentFile } : { content: n.content }),
      ...(n.fileName ? { fileName: n.fileName } : {}),
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
      ...(v.chapterId ? { chapterId: v.chapterId } : {}),
      chapterTitle: v.chapterTitle,
      title: v.title,
      summary: v.summary,
      ...(v.coverage ? { coverage: v.coverage } : {}),
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
      ...(s.provider ? { provider: s.provider as AiProvider } : {}),
      ...(s.model ? { model: s.model } : {}),
      ...(s.reasoningEffort ? { reasoningEffort: s.reasoningEffort as AiReasoningEffort } : {}),
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
      ...(c.dialogueContent ? { dialogueContent: c.dialogueContent } : {}),
      ...(c.readAt !== null && c.readAt !== undefined ? { readAt: c.readAt } : {}),
      ...(c.quote ? { quote: c.quote } : {}),
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
      ...(cfg.oauthProvider
        ? { oauthProvider: cfg.oauthProvider as OpenAICompatibleConfig['oauthProvider'] }
        : {}),
      createdAt: cfg.createdAt,
      updatedAt: cfg.updatedAt,
    }));
  }

  // Read non-table scalar/JSON fields from key_values
  const candidateKvKeys = fields
    ? fields.map(String).filter((k) => !TABLE_BACKED_FIELDS[k] && !RESERVED_KV_KEYS[k])
    : storedFieldsSet
      ? [...storedFieldsSet].filter((k) => !TABLE_BACKED_FIELDS[k] && !RESERVED_KV_KEYS[k])
      : undefined;

  if (!candidateKvKeys) {
    const kvRows = db.select().from(schema.keyValues).all();
    for (const row of kvRows) {
      if (RESERVED_KV_KEYS[row.key] || TABLE_BACKED_FIELDS[row.key]) continue;
      try {
        state[row.key as keyof StoredState] = JSON.parse(row.value);
      } catch {
        // Ignore malformed JSON
      }
    }
  } else if (candidateKvKeys.length > 0) {
    const kvRows = db
      .select()
      .from(schema.keyValues)
      .where(inArray(schema.keyValues.key, candidateKvKeys))
      .all();
    for (const row of kvRows) {
      if (!shouldInclude(row.key as keyof StoredState)) continue;
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

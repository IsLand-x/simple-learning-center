import { markdownNoteTitle } from '../../lib/markdownNotes';
import { legacyReaderPaperColor, readerDensityFromLineHeight } from '../../lib/readerThemes';
import type { AiPreferences, ChatMessage, ChatSession, HighlightItem, NoteItem } from '../../types';
import {
  DEFAULT_RSS_DIGEST_PROMPT,
  defaultAiPreferences,
  defaultReaderPreferences,
  defaultRssDigestSettings,
  defaultWebSearchConfig,
  LEGACY_RSS_DIGEST_PROMPT,
} from '../defaults';
import type { LearningState } from '../learningState';
import {
  normalizeReaderFont,
  normalizeReaderTheme,
  normalizeRssFeedSource,
  normalizeStoredCustomStyle,
} from '../normalizers';

export function migrateLearningState(persistedState: unknown, version: number) {
  const persisted = persistedState as Partial<LearningState> & {
    chats?: Array<Omit<ChatMessage, 'conversationId'> & { conversationId?: string }>;
  };
  let migrated: Partial<LearningState> = persisted;
  if (version < 2) {
    const legacyChats = persisted.chats ?? [];
    const conversationByBook = new Map<string, string>();
    legacyChats.forEach((message) => {
      if (!conversationByBook.has(message.bookId)) {
        conversationByBook.set(message.bookId, `legacy:${message.bookId}`);
      }
    });
    const migratedChats: ChatMessage[] = legacyChats.map((message) => ({
      ...message,
      conversationId: message.conversationId ?? conversationByBook.get(message.bookId)!,
    }));
    const chatSessions: ChatSession[] = Array.from(conversationByBook, ([bookId, id]) => {
      const messages = migratedChats.filter((message) => message.bookId === bookId);
      const firstQuestion = messages
        .find((message) => message.role === 'user')
        ?.content.trim()
        .replace(/\s+/g, ' ');
      const createdAt = Math.min(...messages.map((message) => message.createdAt));
      const updatedAt = Math.max(...messages.map((message) => message.createdAt));
      return {
        id,
        bookId,
        title: firstQuestion?.slice(0, 32) || '旧对话',
        createdAt,
        updatedAt,
      };
    });
    migrated = { ...migrated, chats: migratedChats, chatSessions };
  }
  if (version < 3) {
    migrated = {
      ...migrated,
      readingSessions: [],
      openAIConfigs: [],
      aiPreferences: defaultAiPreferences,
    };
  }
  if (version < 4) {
    const legacySessions = (migrated.chatSessions ?? []) as Array<
      Omit<ChatSession, 'provider'> & { provider?: string }
    >;
    const legacyPreferences = migrated.aiPreferences as
      (Omit<AiPreferences, 'provider'> & { provider?: string }) | undefined;
    migrated = {
      ...migrated,
      chatSessions: legacySessions.map((session) => {
        const { provider, ...sessionWithoutProvider } = session;
        return {
          ...sessionWithoutProvider,
          ...(provider?.startsWith('api:')
            ? { provider: provider as ChatSession['provider'] }
            : {}),
        };
      }),
      aiPreferences: {
        ...defaultAiPreferences,
        ...legacyPreferences,
        provider: legacyPreferences?.provider?.startsWith('api:')
          ? (legacyPreferences.provider as AiPreferences['provider'])
          : null,
      },
    };
  }
  if (version < 5) {
    migrated = {
      ...migrated,
      readerPreferences: {
        ...defaultReaderPreferences,
        ...migrated.readerPreferences,
        fontFamily: normalizeReaderFont(migrated.readerPreferences?.fontFamily),
      },
    };
  }
  if (version < 6) {
    migrated = {
      ...migrated,
      webSearchConfig: defaultWebSearchConfig,
    };
  }
  if (version < 7) {
    const legacyPreferences = migrated.readerPreferences;
    migrated = {
      ...migrated,
      readerPreferences: {
        ...defaultReaderPreferences,
        ...legacyPreferences,
        theme: 'custom',
        customStyle: normalizeStoredCustomStyle({
          fontFamily: normalizeReaderFont(legacyPreferences?.fontFamily),
          paperColor: legacyReaderPaperColor(legacyPreferences?.theme),
          fontSize: legacyPreferences?.fontSize,
          density: readerDensityFromLineHeight(legacyPreferences?.lineHeight),
        }),
      },
    };
  }
  if (version < 8) {
    const legacyNotes = (migrated.notes ?? []) as Array<
      Omit<NoteItem, 'title'> & { title?: string }
    >;
    migrated = {
      ...migrated,
      notes: legacyNotes.map((note) => ({
        ...note,
        title: note.title?.trim() || markdownNoteTitle(note.content),
      })),
    };
  }
  if (version < 9) {
    const legacyHighlights = (migrated.highlights ?? []) as Array<
      HighlightItem & {
        comment?: unknown;
        commentUpdatedAt?: unknown;
      }
    >;
    migrated = {
      ...migrated,
      highlights: legacyHighlights.map((highlight) => {
        const comment = typeof highlight.comment === 'string' ? highlight.comment.trim() : '';
        if (!comment) {
          const {
            comment: _comment,
            commentUpdatedAt: _commentUpdatedAt,
            ...withoutComment
          } = highlight;
          return withoutComment;
        }
        return {
          ...highlight,
          comment,
          commentUpdatedAt:
            typeof highlight.commentUpdatedAt === 'number'
              ? highlight.commentUpdatedAt
              : highlight.createdAt,
        };
      }),
    };
  }
  if (version < 10) {
    migrated = {
      ...migrated,
      highlights: (migrated.highlights ?? []).map((highlight) => ({
        ...highlight,
        kind: highlight.kind === 'comment' ? 'comment' : 'highlight',
      })),
    };
  }
  if (version < 11) {
    migrated = {
      ...migrated,
      readerPreferences: {
        ...defaultReaderPreferences,
        ...migrated.readerPreferences,
        customStyle: normalizeStoredCustomStyle(migrated.readerPreferences?.customStyle),
      },
    };
  }
  if (version < 12) {
    migrated = {
      ...migrated,
      readerPreferences: {
        ...defaultReaderPreferences,
        ...migrated.readerPreferences,
        customStyle: normalizeStoredCustomStyle(migrated.readerPreferences?.customStyle),
      },
    };
  }
  if (version < 13) {
    migrated = {
      ...migrated,
      rssFolders: [],
      rssFeeds: [],
      rssItems: [],
    };
  }
  if (version < 14) {
    migrated = {
      ...migrated,
      rssPanelWidth: 380,
    };
  }
  if (version < 15) {
    migrated = {
      ...migrated,
      rssItems: (migrated.rssItems ?? []).map((item) => ({
        ...item,
        ...(item.aiSummary && !item.aiSummaryVersion ? { aiSummaryVersion: 1 } : {}),
      })),
    };
  }
  if (version < 16) {
    migrated = {
      ...migrated,
      rssAnnotations: [],
    };
  }
  if (version < 17) {
    migrated = {
      ...migrated,
      rssFeeds: (migrated.rssFeeds ?? []).map((feed) => ({
        ...feed,
        fetchFullContent: Boolean(feed.fetchFullContent),
      })),
    };
  }
  if (version < 18) {
    migrated = {
      ...migrated,
      videoResources: [],
      videoTimestampNotes: [],
      videoPanelWidth: 400,
    };
  }
  if (version < 19) {
    migrated = {
      ...migrated,
      rssDailyDigests: [],
      rssDigestSettings: defaultRssDigestSettings,
    };
  }
  if (version < 20) {
    migrated = {
      ...migrated,
      rssDigestRuns: [],
    };
  }
  if (version < 21) {
    const digestSettings = migrated.rssDigestSettings;
    migrated = {
      ...migrated,
      rssDigestSettings: {
        ...defaultRssDigestSettings,
        ...digestSettings,
        prompt:
          !digestSettings?.prompt || digestSettings.prompt === LEGACY_RSS_DIGEST_PROMPT
            ? DEFAULT_RSS_DIGEST_PROMPT
            : digestSettings.prompt,
      },
    };
  }
  if (version < 23) {
    migrated = {
      ...migrated,
      rssItems: (migrated.rssItems ?? []).map((item) => ({
        ...item,
        ...(typeof item.aiTranslationHtml === 'string' && item.aiTranslationHtml.trim()
          ? { aiTranslationHtml: item.aiTranslationHtml }
          : { aiTranslationHtml: undefined }),
      })),
      rssFeeds: (migrated.rssFeeds ?? []).map((feed) => normalizeRssFeedSource(feed)),
    };
  }
  if (version < 24) {
    migrated = {
      ...migrated,
      bookLists: [],
    };
  }
  if (version < 25) {
    migrated = {
      ...migrated,
      trashedBooks: [],
      deletedBookTombstones: [],
    };
  }
  if (version < 26) {
    migrated = {
      ...migrated,
      readerPreferences: {
        ...defaultReaderPreferences,
        ...migrated.readerPreferences,
        theme: normalizeReaderTheme(migrated.readerPreferences?.theme),
        customStyle: normalizeStoredCustomStyle(migrated.readerPreferences?.customStyle),
      },
      highlights: (migrated.highlights ?? []).map((highlight) => ({
        ...highlight,
        updatedAt: highlight.updatedAt ?? highlight.commentUpdatedAt ?? highlight.createdAt,
      })),
      deletedHighlightTombstones: [],
      readerPreferencesUpdatedAt: 0,
    };
  }
  if (version < 28) {
    const legacyPreferencesUpdatedAt =
      typeof migrated.readerPreferencesUpdatedAt === 'number'
        ? migrated.readerPreferencesUpdatedAt
        : 0;
    migrated = {
      ...migrated,
      readerStyleUpdatedAt: legacyPreferencesUpdatedAt,
      readerLayoutUpdatedAt: legacyPreferencesUpdatedAt,
    };
  }
  return migrated;
}

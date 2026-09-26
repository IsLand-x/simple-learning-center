import { randomUUID } from 'node:crypto';
import type { ChatMessage, ChatSession, RssDigestRun } from '../../../contracts/domain.js';
import type { AiJob, AiJobRequest, AiChatContext } from './types.js';
import { statusError } from '../../infrastructure/http/errors.js';
import { readPersistedState, mutatePersistedState } from '../state/repository.js';
import { prepareRssTranslationSource } from '../rss/translation.js';
import {
  requiredString,
  optionalString,
  optionalReasoningEffort,
  makeConversationTitle,
  normalizedMessage,
  publicJob,
  upsertDigestRun,
} from './jobModel.js';

interface StartDependencies {
  jobs: Map<string, AiJob>;
  pruneJobs: () => void;
  executeJob: (job: AiJob, context: AiChatContext) => Promise<void>;
}

export function createJobStarter({ jobs, pruneJobs, executeJob }: StartDependencies) {
  async function start(rawInput: unknown) {
    const input = rawInput as AiJobRequest | undefined;
    pruneJobs();
    const resourceType =
      input?.resourceType === 'rss'
        ? 'rss'
        : input?.resourceType === 'video'
          ? 'video'
          : input?.resourceType === 'rssDigest'
            ? 'rssDigest'
            : 'book';
    const purpose =
      resourceType === 'rss'
        ? input?.purpose === 'summary'
          ? 'summary'
          : input?.purpose === 'translation'
            ? 'translation'
            : 'chat'
        : resourceType === 'rssDigest'
          ? 'digest'
          : 'chat';
    const configId = requiredString(input?.configId, '模型配置', 200);
    const model = requiredString(input?.model, '模型名称', 300);
    const reasoningEffort = optionalReasoningEffort(input?.reasoningEffort);
    const bookId = requiredString(input?.bookId, resourceType === 'book' ? '书籍' : '内容', 240);
    const rssItemId =
      resourceType === 'rss' ? requiredString(input?.rssItemId, 'RSS 内容', 240) : undefined;
    const videoId =
      resourceType === 'video' ? requiredString(input?.videoId, '视频', 240) : undefined;
    const digestDate =
      resourceType === 'rssDigest' ? requiredString(input?.digestDate, '日报日期', 10) : undefined;
    if (digestDate && !/^\d{4}-\d{2}-\d{2}$/.test(digestDate))
      throw statusError(400, '日报日期不正确');
    const digestRunId =
      resourceType === 'rssDigest'
        ? optionalString(input?.digestRunId, 200).trim() || randomUUID()
        : undefined;
    const digestTrigger =
      resourceType === 'rssDigest' && input?.digestTrigger === 'schedule' ? 'schedule' : 'manual';
    const digestScheduleKey =
      resourceType === 'rssDigest'
        ? optionalString(input?.digestScheduleKey, 200).trim() || undefined
        : undefined;
    const digestRunStartedAt =
      resourceType === 'rssDigest' && Number.isFinite(input?.digestRunStartedAt)
        ? input!.digestRunStartedAt!
        : Date.now();
    const conversationId = requiredString(input?.conversationId, '对话', 200);
    const messageInput = input?.userMessage;
    const userMessageId = requiredString(messageInput?.id, '消息', 200);
    const content = requiredString(messageInput?.content, '问题内容', 50_000);
    const createdAt = Number.isFinite(messageInput?.createdAt)
      ? messageInput!.createdAt!
      : Date.now();
    const quoteText = optionalString(messageInput?.quote?.text, 20_000).trim();
    const quote = quoteText
      ? {
          text: quoteText,
          chapter: optionalString(messageInput?.quote?.chapter, 500),
        }
      : undefined;
    const currentText = optionalString(input?.currentText, 30_000);

    const persistedState = await readPersistedState();
    if (!persistedState?.state) throw statusError(409, '服务端尚未初始化');
    const state = persistedState.state;
    const config = (Array.isArray(state.openAIConfigs) ? state.openAIConfigs : []).find(
      (item) => item.id === configId,
    );
    if (!config) throw statusError(404, '找不到所选模型配置');
    if (!Array.isArray(config.models) || !config.models.includes(model)) {
      throw statusError(400, '所选模型不属于当前配置');
    }
    const book =
      resourceType === 'book'
        ? (Array.isArray(state.books) ? state.books : []).find((item) => item.id === bookId)
        : undefined;
    if (resourceType === 'book' && !book) throw statusError(404, '找不到当前书籍');
    const rssItem =
      resourceType === 'rss'
        ? (Array.isArray(state.rssItems) ? state.rssItems : []).find(
            (item) => item.id === rssItemId,
          )
        : undefined;
    if (resourceType === 'rss' && (!rssItem || bookId !== `rss:${rssItem.id}`)) {
      throw statusError(404, '找不到当前 RSS 内容');
    }
    let translationSource;
    if (resourceType === 'rss' && purpose === 'translation') {
      try {
        translationSource = prepareRssTranslationSource(rssItem);
      } catch (error) {
        throw statusError(422, error instanceof Error ? error.message : '当前 RSS 内容无法翻译');
      }
    }
    const rssFeed = rssItem
      ? (Array.isArray(state.rssFeeds) ? state.rssFeeds : []).find(
          (feed) => feed.id === rssItem.feedId,
        )
      : undefined;
    const video =
      resourceType === 'video'
        ? (Array.isArray(state.videoResources) ? state.videoResources : []).find(
            (item) => item.id === videoId,
          )
        : undefined;
    if (resourceType === 'video' && (!video || bookId !== `video:${video.id}`)) {
      throw statusError(404, '找不到当前视频');
    }
    const digestItemIds =
      resourceType === 'rssDigest' && Array.isArray(input?.digestItemIds)
        ? [...new Set(input.digestItemIds)].slice(0, 1_000)
        : [];
    const digestItems =
      resourceType === 'rssDigest'
        ? digestItemIds.flatMap((itemId) => {
            const item = (Array.isArray(state.rssItems) ? state.rssItems : []).find(
              (candidate) => candidate.id === itemId,
            );
            return item ? [item] : [];
          })
        : [];
    if (
      resourceType === 'rssDigest' &&
      (bookId !== `rss-digest:${digestDate}` || !digestItems.length)
    ) {
      throw statusError(404, '找不到可用于当前日报的 RSS 内容');
    }
    const digestFeeds =
      resourceType === 'rssDigest'
        ? (Array.isArray(state.rssFeeds) ? state.rssFeeds : []).filter((feed) =>
            digestItems.some((item) => item.feedId === feed.id),
          )
        : [];
    const previousDigest =
      resourceType === 'rssDigest'
        ? (Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : []).find(
            (digest) => digest.date === digestDate,
          )
        : undefined;

    const existingChats = (Array.isArray(state.chats) ? state.chats : [])
      .filter(
        (message) =>
          message.bookId === bookId &&
          message.conversationId === conversationId &&
          message.id !== userMessageId &&
          (message.role === 'user' || message.role === 'assistant'),
      )
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-40)
      .map(normalizedMessage);
    const userMessage: ChatMessage = {
      id: userMessageId,
      bookId,
      conversationId,
      role: 'user',
      content,
      ...(quote ? { quote } : {}),
      createdAt,
    };
    const provider = `api:${configId}` as const;
    const sessionInput = input?.session;
    const sessionCreatedAt = Number.isFinite(sessionInput?.createdAt)
      ? sessionInput!.createdAt!
      : createdAt;
    const session: ChatSession = {
      id: conversationId,
      bookId,
      title: optionalString(sessionInput?.title, 100).trim() || makeConversationTitle(content),
      provider,
      model,
      reasoningEffort: reasoningEffort || 'auto',
      createdAt: sessionCreatedAt,
      updatedAt: createdAt,
    };
    const timestamp = Date.now();
    const digestRun: RssDigestRun | undefined =
      resourceType === 'rssDigest'
        ? {
            id: digestRunId!,
            date: digestDate!,
            trigger: digestTrigger,
            status: 'queued',
            ...(digestScheduleKey ? { scheduleKey: digestScheduleKey } : {}),
            model,
            itemCount: digestItems.length,
            startedAt: digestRunStartedAt,
            updatedAt: timestamp,
          }
        : undefined;

    await mutatePersistedState((nextPersistedState) => {
      const next = nextPersistedState.state;
      const sessions = Array.isArray(next.chatSessions) ? next.chatSessions : [];
      const existingSession = sessions.find((item) => item.id === conversationId);
      next.chatSessions = [
        existingSession
          ? {
              ...existingSession,
              provider,
              model,
              reasoningEffort: reasoningEffort || 'auto',
              updatedAt: Math.max(existingSession.updatedAt, createdAt),
            }
          : session,
        ...sessions.filter((item) => item.id !== conversationId),
      ];
      const chats = Array.isArray(next.chats) ? next.chats : [];
      next.chats = [...chats.filter((item) => item.id !== userMessageId), userMessage];
      if (digestRun) upsertDigestRun(next, structuredClone(digestRun));
    });

    const job: AiJob = {
      id: randomUUID(),
      bookId,
      resourceType,
      rssItemId,
      videoId,
      digestDate,
      digestRunId,
      digestTrigger,
      digestScheduleKey,
      digestItems: digestItems.map((item) => structuredClone(item)),
      model,
      reasoningEffort,
      purpose,
      conversationId,
      userMessageId,
      assistantMessageId: randomUUID(),
      assistantCreatedAt: timestamp,
      status: 'queued',
      revision: 0,
      content: '',
      dialogueContent: [],
      notesRevision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: undefined,
      error: undefined,
      controller: new AbortController(),
      userMessage: structuredClone(userMessage),
      session: structuredClone(session),
      finalResult: undefined,
    };
    jobs.set(job.id, job);
    const context: AiChatContext = {
      config: structuredClone(config),
      model,
      reasoningEffort,
      conversationId,
      messages: [...existingChats, normalizedMessage(userMessage)],
      resourceType,
      purpose,
      ...(book ? { book: structuredClone(book) } : {}),
      ...(rssItem
        ? {
            rssItem: structuredClone(rssItem),
            rssFeed: rssFeed ? structuredClone(rssFeed) : undefined,
            ...(translationSource ? { translationSource: structuredClone(translationSource) } : {}),
            relatedRssItems: (Array.isArray(state.rssItems) ? state.rssItems : [])
              .filter((item) => item.feedId === rssItem.feedId && item.id !== rssItem.id)
              .sort((left, right) => right.publishedAt - left.publishedAt)
              .slice(0, 30)
              .map((item) => structuredClone(item)),
          }
        : {}),
      ...(video
        ? {
            video: structuredClone(video),
            videoTimestampNotes: (Array.isArray(state.videoTimestampNotes)
              ? state.videoTimestampNotes
              : []
            )
              .filter((note) => note.videoId === video.id)
              .sort((left, right) => left.timeSeconds - right.timeSeconds)
              .map((note) => structuredClone(note)),
          }
        : {}),
      ...(resourceType === 'rssDigest'
        ? {
            digestItems: digestItems.map((item) => structuredClone(item)),
            digestFeeds: digestFeeds.map((feed) => structuredClone(feed)),
            previousDigest: previousDigest ? structuredClone(previousDigest) : undefined,
          }
        : {}),
      currentText,
      notes: (Array.isArray(state.notes) ? state.notes : [])
        .filter((note) => note.bookId === bookId)
        .map((note) => structuredClone(note)),
      highlights: (Array.isArray(state.highlights) ? state.highlights : [])
        .filter((highlight) => highlight.bookId === bookId)
        .map((highlight) => structuredClone(highlight)),
      readingSessions: (Array.isArray(state.readingSessions) ? state.readingSessions : [])
        .filter((readingSession) => readingSession.bookId === bookId)
        .sort((left, right) => right.startedAt - left.startedAt)
        .map((readingSession) => structuredClone(readingSession)),
      webSearchConfig: structuredClone(state.webSearchConfig ?? { provider: 'jina', apiKey: '' }),
      assistantPrompt:
        resourceType === 'book'
          ? optionalString(state.aiPreferences?.assistantPrompt, 4_000).trim()
          : '',
    };
    queueMicrotask(() => void executeJob(job, context));
    return publicJob(job);
  }
  return start;
}

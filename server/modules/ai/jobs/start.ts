import { findMindMapChapter } from '../mindmaps/model.js';
import { videoNarrationSchema } from '../chapterVideos/model.js';
import { speechUrl } from '../chapterVideos/media.js';
import { ttsSettings } from '../speech/settings.js';
import type { VideoNarrationContext } from '../chapterVideos/media.js';
import { randomUUID } from 'node:crypto';
import type { ChatMessage, ChatSession } from '../../../../contracts/ai.js';
import type { RssDigestRun } from '../../../../contracts/rss.js';
import type { AiJob, AiJobRequest, AiChatContext } from './types.js';
import { statusError } from '../../../infrastructure/http/errors.js';
import { readPersistedState, mutatePersistedState } from '../../state/stateStore.js';
import { prepareRssTranslationSource } from '../../rss/translation.js';
import {
  requiredString,
  optionalString,
  optionalReasoningEffort,
  makeConversationTitle,
  normalizedMessage,
  publicJob,
  upsertDigestRun,
} from './model.js';

interface StartDependencies {
  jobs: Map<string, AiJob>;
  pruneJobs: () => void;
  executeJob: (job: AiJob, context: AiChatContext) => Promise<void>;
  persistJob: (job: AiJob) => Promise<void>;
}

export function createJobStarter({ jobs, pruneJobs, executeJob, persistJob }: StartDependencies) {
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
          : resourceType === 'book' && input?.purpose === 'glossary'
            ? 'glossary'
            : resourceType === 'book' && input?.purpose === 'mindmap'
              ? 'mindmap'
              : resourceType === 'book' && input?.purpose === 'chapter-video'
                ? 'chapter-video'
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
    let createdAt = Date.now();
    const quoteText = optionalString(messageInput?.quote?.text, 20_000).trim();
    const quote = quoteText
      ? {
          text: quoteText,
          chapter: optionalString(messageInput?.quote?.chapter, 500),
        }
      : undefined;
    const currentText = optionalString(input?.currentText, 30_000);

    const persistedState = await readPersistedState({
      hydrateNote: (note) => note.bookId === bookId,
      hydrateCovers: false,
    });
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
    const chapterId =
      purpose === 'mindmap' || (purpose === 'chapter-video' && input?.chapterId !== undefined)
        ? requiredString(input?.chapterId, '章节', 500)
        : undefined;
    if (chapterId && !findMindMapChapter(book!.toc, chapterId))
      throw statusError(404, '章节不存在或不属于当前书籍');
    let videoNarration: VideoNarrationContext | undefined;
    if (purpose === 'chapter-video' && input?.videoNarration !== undefined) {
      const parsed = videoNarrationSchema.safeParse(input.videoNarration);
      if (!parsed.success) throw statusError(400, '配音配置不正确');
      if ('source' in parsed.data) {
        const speech = await ttsSettings.read();
        if (!speech) throw statusError(400, '请先在设置的 TTS 标签中保存语音配置');
        videoNarration = {
          tts: speech,
          model: speech.model,
          voice: speech.voice,
          config: {
            id: 'tts-settings',
            name: '阿里云百炼',
            baseUrl: '',
            apiKey: speech.apiKey,
            models: [],
            createdAt: 0,
            updatedAt: speech.updatedAt,
          },
        };
      } else {
        const { configId, model: speechModel, voice } = parsed.data;
        const speechConfig = state.openAIConfigs?.find((item) => item.id === configId);
        if (!speechConfig || speechConfig.oauthProvider || !speechConfig.apiKey?.trim())
          throw statusError(400, '请选择有 API Key 的配音供应商，登录授权不能用于语音接口');
        speechUrl(speechConfig.baseUrl);
        videoNarration = {
          config: structuredClone(speechConfig),
          model: speechModel,
          voice,
        };
      }
    }
    const termId = purpose === 'glossary' ? requiredString(input?.termId, '术语', 200) : undefined;
    const term = termId
      ? (state.highlights ?? []).find(
          (item) => item.id === termId && item.bookId === bookId && item.kind === 'term',
        )
      : undefined;
    if (termId && !term) throw statusError(404, '术语已删除或不属于当前书籍');
    if (
      termId &&
      [...jobs.values()].some(
        (job) => job.termId === termId && ['queued', 'running'].includes(job.status),
      )
    ) {
      throw statusError(409, '该术语正在生成释义');
    }
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

    await mutatePersistedState(
      (nextPersistedState) => {
        if (nextPersistedState.deletedConversationIds?.includes(conversationId))
          throw statusError(404, '对话已删除，请开启新对话');
        const next = nextPersistedState.state;
        if (
          (chapterId || purpose === 'chapter-video') &&
          [...jobs.values()].some(
            (job) =>
              job.bookId === bookId &&
              job.chapterId === chapterId &&
              job.purpose === purpose &&
              ['queued', 'running'].includes(job.status),
          )
        )
          throw statusError(
            409,
            purpose === 'chapter-video' ? '所选范围正在生成视频' : '该章节正在生成思维导图',
          );
        if (
          purpose === 'chapter-video' &&
          [...jobs.values()].filter(
            (job) => job.purpose === 'chapter-video' && ['queued', 'running'].includes(job.status),
          ).length >= 2
        )
          throw statusError(409, '已有两个视频任务，请等待完成后再生成');
        if (purpose !== 'glossary' && purpose !== 'mindmap' && purpose !== 'chapter-video') {
          // Assign message order inside the write queue, using one clock for both roles.
          // Client clocks may be ahead, behind, or change between consecutive turns.
          const chats = Array.isArray(next.chats) ? next.chats : [];
          createdAt = chats.reduce(
            (latest, message) =>
              message.bookId === bookId && message.conversationId === conversationId
                ? Math.max(latest, message.createdAt + 1)
                : latest,
            Date.now(),
          );
          userMessage.createdAt = createdAt;
          session.createdAt = createdAt;
          session.updatedAt = createdAt;
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
          next.chats = [...chats.filter((item) => item.id !== userMessageId), userMessage];
        }
        if (digestRun) upsertDigestRun(next, structuredClone(digestRun));
      },
      { preserveResourceFiles: true },
    );

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
      termId,
      chapterId,
      chapterTitle:
        purpose === 'chapter-video'
          ? chapterId
            ? findMindMapChapter(book!.toc, chapterId)?.label
            : '全书导读'
          : undefined,
      termUpdatedAt: term?.updatedAt ?? term?.createdAt,
      conversationId,
      userMessageId,
      assistantMessageId: randomUUID(),
      assistantCreatedAt: Math.max(timestamp, createdAt + 1),
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
    try {
      await persistJob(job);
    } catch (error) {
      jobs.delete(job.id);
      throw error;
    }
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
      ...(videoNarration ? { videoNarration } : {}),
    };
    queueMicrotask(() => void executeJob(job, context));
    return publicJob(job);
  }
  return start;
}

import { randomUUID } from 'node:crypto';
import { runServerAiChat } from './aiChat.mjs';
import { statusError } from './errors.mjs';
import { mutatePersistedState, readPersistedState } from './storage.mjs';

const JOB_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_RETAINED_JOBS = 100;
const MAX_RETAINED_DIGEST_RUNS = 100;

function upsertDigestRun(state, run) {
  const runs = Array.isArray(state.rssDigestRuns) ? state.rssDigestRuns : [];
  state.rssDigestRuns = [run, ...runs.filter((item) => item.id !== run.id)]
    .sort((left, right) => Number(right.startedAt || 0) - Number(left.startedAt || 0))
    .slice(0, MAX_RETAINED_DIGEST_RUNS);
}

function requiredString(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw statusError(400, `${label}不正确`);
  }
  return value.trim();
}

function optionalString(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function publicJob(job) {
  return {
    id: job.id,
    bookId: job.bookId,
    resourceType: job.resourceType,
    rssItemId: job.rssItemId,
    videoId: job.videoId,
    digestDate: job.digestDate,
    purpose: job.purpose,
    conversationId: job.conversationId,
    userMessageId: job.userMessageId,
    assistantMessageId: job.assistantMessageId,
    status: job.status,
    revision: job.revision,
    content: job.content,
    dialogueContent: job.dialogueContent,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

function makeConversationTitle(content) {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  return (lines.at(-1) || '关于本书的对话').replace(/\s+/g, ' ').slice(0, 32);
}

function safeErrorMessage(error, secrets = []) {
  let message = error instanceof Error ? error.message : '模型请求失败';
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret) message = message.replaceAll(secret, '[已隐藏]');
  }
  return message.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]');
}

function normalizedMessage(message) {
  const role = message?.role === 'assistant' ? 'assistant' : 'user';
  return {
    role,
    content: optionalString(message?.content, 100_000),
    ...(role === 'user' && message?.quote?.text ? {
      quote: {
        text: optionalString(message.quote.text, 20_000),
        chapter: optionalString(message.quote.chapter, 500),
      },
    } : {}),
  };
}

export function createAiJobManager({ runChat = runServerAiChat } = {}) {
  const jobs = new Map();
  const subscribers = new Map();

  async function updateDigestRun(runId, changes) {
    if (!runId) return;
    await mutatePersistedState((persistedState) => {
      const runs = Array.isArray(persistedState.state.rssDigestRuns)
        ? persistedState.state.rssDigestRuns
        : [];
      const current = runs.find((run) => run.id === runId);
      if (!current) return;
      upsertDigestRun(persistedState.state, {
        ...current,
        ...changes,
        updatedAt: Number.isFinite(changes.updatedAt) ? changes.updatedAt : Date.now(),
      });
    });
  }

  function publishJob(job) {
    const listeners = subscribers.get(job.id);
    if (!listeners?.size) return;
    const snapshot = publicJob(job);
    for (const listener of [...listeners]) listener(snapshot);
  }

  function subscribe(id, listener) {
    const job = jobs.get(id);
    if (!job) throw statusError(404, 'AI 任务不存在或已过期');
    const listeners = subscribers.get(id) ?? new Set();
    listeners.add(listener);
    subscribers.set(id, listeners);
    listener(publicJob(job));
    return () => {
      listeners.delete(listener);
      if (!listeners.size) subscribers.delete(id);
    };
  }

  function pruneJobs() {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (
        !['queued', 'running'].includes(job.status)
        && now - job.updatedAt > JOB_RETENTION_MS
      ) {
        jobs.delete(id);
      }
    }
    if (jobs.size <= MAX_RETAINED_JOBS) return;
    const removable = [...jobs.values()]
      .filter((job) => !['queued', 'running'].includes(job.status))
      .sort((left, right) => left.updatedAt - right.updatedAt);
    for (const job of removable) {
      if (jobs.size <= MAX_RETAINED_JOBS) break;
      jobs.delete(job.id);
    }
  }

  async function persistAssistant(job, result) {
    await mutatePersistedState((persistedState) => {
      const state = persistedState.state;
      const sessions = Array.isArray(state.chatSessions) ? state.chatSessions : [];
      if (!sessions.some((session) => session.id === job.conversationId)) return;
      const message = {
        id: job.assistantMessageId,
        bookId: job.bookId,
        conversationId: job.conversationId,
        role: 'assistant',
        content: result.content,
        dialogueContent: result.dialogueContent,
        createdAt: job.assistantCreatedAt,
      };
      const chats = Array.isArray(state.chats) ? state.chats : [];
      state.chats = [...chats.filter((item) => item.id !== message.id), message];
      state.chatSessions = sessions.map((session) => (
        session.id === job.conversationId
          ? { ...session, updatedAt: Math.max(session.updatedAt, message.createdAt) }
          : session
      ));
      if (job.resourceType === 'rss' && job.purpose === 'summary') {
        const rssItems = Array.isArray(state.rssItems) ? state.rssItems : [];
        state.rssItems = rssItems.map((item) => (
          item.id === job.rssItemId
            ? {
              ...item,
              aiSummary: result.content,
              aiSummaryUpdatedAt: job.assistantCreatedAt,
              aiSummaryVersion: 2,
            }
            : item
        ));
      }
      if (job.resourceType === 'rss' && job.purpose === 'translation') {
        const rssItems = Array.isArray(state.rssItems) ? state.rssItems : [];
        state.rssItems = rssItems.map((item) => (
          item.id === job.rssItemId
            ? {
              ...item,
              aiTranslation: result.content,
              aiTranslationUpdatedAt: job.assistantCreatedAt,
              aiTranslationSourceFetchedAt: Number(item.fullContentFetchedAt || item.fetchedAt || 0),
            }
            : item
        ));
      }
      if (job.resourceType === 'rssDigest' && job.purpose === 'digest') {
        const completedAt = Date.now();
        const digests = Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : [];
        const feedIds = [...new Set(job.digestItems.map((item) => item.feedId))];
        const previous = digests.find((digest) => digest.date === job.digestDate);
        const digest = {
          id: `rss-digest:${job.digestDate}`,
          date: job.digestDate,
          content: result.content,
          sourceItemIds: job.digestItems.map((item) => item.id),
          sourceFeedIds: feedIds,
          itemCount: job.digestItems.length,
          model: job.model,
          generatedAt: previous?.generatedAt || job.assistantCreatedAt,
          updatedAt: job.assistantCreatedAt,
        };
        state.rssDailyDigests = [digest, ...digests.filter((item) => item.id !== digest.id)]
          .sort((left, right) => right.date.localeCompare(left.date));
        state.rssDigestSettings = {
          ...(state.rssDigestSettings || {}),
          lastCompletedAt: completedAt,
          lastError: undefined,
        };
        const runs = Array.isArray(state.rssDigestRuns) ? state.rssDigestRuns : [];
        const digestRun = runs.find((run) => run.id === job.digestRunId);
        if (digestRun) {
          upsertDigestRun(state, {
            ...digestRun,
            status: 'completed',
            completedAt,
            updatedAt: completedAt,
            message: undefined,
          });
        }
      }
    });
  }

  async function executeJob(job, context) {
    if (job.status === 'cancelled') return;
    job.status = 'running';
    job.updatedAt = Date.now();
    job.revision += 1;
    publishJob(job);
    try {
      if (job.resourceType === 'rssDigest') {
        await updateDigestRun(job.digestRunId, { status: 'running' });
      }
      const result = await runChat({
        ...context,
        signal: job.controller.signal,
        onProgress(progress) {
          if (job.status === 'cancelled') return;
          job.content = progress.content;
          job.dialogueContent = structuredClone(progress.dialogueContent);
          job.updatedAt = Date.now();
          job.revision += 1;
          publishJob(job);
        },
      });
      if (job.controller.signal.aborted || job.status === 'cancelled') return;
      job.finalResult = structuredClone(result);
      await persistAssistant(job, result);
      job.content = result.content;
      job.dialogueContent = structuredClone(result.dialogueContent);
      job.status = 'completed';
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      job.revision += 1;
      publishJob(job);
    } catch (error) {
      if (job.controller.signal.aborted || job.status === 'cancelled' || error?.name === 'AbortError') {
        job.status = 'cancelled';
        job.error = undefined;
      } else {
        job.status = 'failed';
        job.error = safeErrorMessage(error, [context.config.apiKey, context.webSearchConfig.apiKey]);
        console.error(`AI task ${job.id} failed`);
      }
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      if (job.resourceType === 'rssDigest') {
        await mutatePersistedState((persistedState) => {
          if (job.status === 'failed') {
            persistedState.state.rssDigestSettings = {
              ...(persistedState.state.rssDigestSettings || {}),
              lastError: job.error,
            };
          }
          const runs = Array.isArray(persistedState.state.rssDigestRuns)
            ? persistedState.state.rssDigestRuns
            : [];
          const digestRun = runs.find((run) => run.id === job.digestRunId);
          if (digestRun) {
            upsertDigestRun(persistedState.state, {
              ...digestRun,
              status: job.status,
              completedAt: job.completedAt,
              updatedAt: job.completedAt,
              message: job.error,
            });
          }
        }).catch(() => undefined);
      }
      job.revision += 1;
      publishJob(job);
    } finally {
      pruneJobs();
    }
  }

  async function start(input) {
    pruneJobs();
    const resourceType = input?.resourceType === 'rss'
      ? 'rss'
      : input?.resourceType === 'video'
        ? 'video'
        : input?.resourceType === 'rssDigest' ? 'rssDigest' : 'book';
    const purpose = resourceType === 'rss'
      ? input?.purpose === 'summary' ? 'summary' : input?.purpose === 'translation' ? 'translation' : 'chat'
      : resourceType === 'rssDigest' ? 'digest' : 'chat';
    const configId = requiredString(input?.configId, '模型配置', 200);
    const model = requiredString(input?.model, '模型名称', 300);
    const bookId = requiredString(input?.bookId, resourceType === 'book' ? '书籍' : '内容', 240);
    const rssItemId = resourceType === 'rss'
      ? requiredString(input?.rssItemId, 'RSS 内容', 240)
      : undefined;
    const videoId = resourceType === 'video'
      ? requiredString(input?.videoId, '视频', 240)
      : undefined;
    const digestDate = resourceType === 'rssDigest'
      ? requiredString(input?.digestDate, '日报日期', 10)
      : undefined;
    if (digestDate && !/^\d{4}-\d{2}-\d{2}$/.test(digestDate)) throw statusError(400, '日报日期不正确');
    const digestRunId = resourceType === 'rssDigest'
      ? optionalString(input?.digestRunId, 200).trim() || randomUUID()
      : undefined;
    const digestTrigger = resourceType === 'rssDigest' && input?.digestTrigger === 'schedule'
      ? 'schedule'
      : 'manual';
    const digestScheduleKey = resourceType === 'rssDigest'
      ? optionalString(input?.digestScheduleKey, 200).trim() || undefined
      : undefined;
    const digestRunStartedAt = resourceType === 'rssDigest' && Number.isFinite(input?.digestRunStartedAt)
      ? input.digestRunStartedAt
      : Date.now();
    const conversationId = requiredString(input?.conversationId, '对话', 200);
    const messageInput = input?.userMessage;
    const userMessageId = requiredString(messageInput?.id, '消息', 200);
    const content = requiredString(messageInput?.content, '问题内容', 50_000);
    const createdAt = Number.isFinite(messageInput?.createdAt) ? messageInput.createdAt : Date.now();
    const quoteText = optionalString(messageInput?.quote?.text, 20_000).trim();
    const quote = quoteText ? {
      text: quoteText,
      chapter: optionalString(messageInput?.quote?.chapter, 500),
    } : undefined;
    const currentText = optionalString(input?.currentText, 30_000);

    const persistedState = await readPersistedState();
    if (!persistedState?.state) throw statusError(409, '服务端尚未初始化');
    const state = persistedState.state;
    const config = (Array.isArray(state.openAIConfigs) ? state.openAIConfigs : [])
      .find((item) => item.id === configId);
    if (!config) throw statusError(404, '找不到所选模型配置');
    if (!Array.isArray(config.models) || !config.models.includes(model)) {
      throw statusError(400, '所选模型不属于当前配置');
    }
    const book = resourceType === 'book'
      ? (Array.isArray(state.books) ? state.books : []).find((item) => item.id === bookId)
      : undefined;
    if (resourceType === 'book' && !book) throw statusError(404, '找不到当前书籍');
    const rssItem = resourceType === 'rss'
      ? (Array.isArray(state.rssItems) ? state.rssItems : []).find((item) => item.id === rssItemId)
      : undefined;
    if (resourceType === 'rss' && (!rssItem || bookId !== `rss:${rssItem.id}`)) {
      throw statusError(404, '找不到当前 RSS 内容');
    }
    const rssFeed = rssItem
      ? (Array.isArray(state.rssFeeds) ? state.rssFeeds : []).find((feed) => feed.id === rssItem.feedId)
      : undefined;
    const video = resourceType === 'video'
      ? (Array.isArray(state.videoResources) ? state.videoResources : []).find((item) => item.id === videoId)
      : undefined;
    if (resourceType === 'video' && (!video || bookId !== `video:${video.id}`)) {
      throw statusError(404, '找不到当前视频');
    }
    const digestItemIds = resourceType === 'rssDigest' && Array.isArray(input?.digestItemIds)
      ? [...new Set(input.digestItemIds)].slice(0, 1_000)
      : [];
    const digestItems = resourceType === 'rssDigest'
      ? digestItemIds.flatMap((itemId) => {
        const item = (Array.isArray(state.rssItems) ? state.rssItems : []).find((candidate) => candidate.id === itemId);
        return item ? [item] : [];
      })
      : [];
    if (resourceType === 'rssDigest' && (bookId !== `rss-digest:${digestDate}` || !digestItems.length)) {
      throw statusError(404, '找不到可用于当前日报的 RSS 内容');
    }
    const digestFeeds = resourceType === 'rssDigest'
      ? (Array.isArray(state.rssFeeds) ? state.rssFeeds : []).filter((feed) => digestItems.some((item) => item.feedId === feed.id))
      : [];
    const previousDigest = resourceType === 'rssDigest'
      ? (Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : []).find((digest) => digest.date === digestDate)
      : undefined;

    const existingChats = (Array.isArray(state.chats) ? state.chats : [])
      .filter((message) => (
        message.bookId === bookId
        && message.conversationId === conversationId
        && message.id !== userMessageId
        && (message.role === 'user' || message.role === 'assistant')
      ))
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-40)
      .map(normalizedMessage);
    const userMessage = {
      id: userMessageId,
      bookId,
      conversationId,
      role: 'user',
      content,
      ...(quote ? { quote } : {}),
      createdAt,
    };
    const provider = `api:${configId}`;
    const sessionInput = input?.session;
    const sessionCreatedAt = Number.isFinite(sessionInput?.createdAt)
      ? sessionInput.createdAt
      : createdAt;
    const session = {
      id: conversationId,
      bookId,
      title: optionalString(sessionInput?.title, 100).trim() || makeConversationTitle(content),
      provider,
      model,
      createdAt: sessionCreatedAt,
      updatedAt: createdAt,
    };
    const timestamp = Date.now();
    const digestRun = resourceType === 'rssDigest' ? {
      id: digestRunId,
      date: digestDate,
      trigger: digestTrigger,
      status: 'queued',
      ...(digestScheduleKey ? { scheduleKey: digestScheduleKey } : {}),
      model,
      itemCount: digestItems.length,
      startedAt: digestRunStartedAt,
      updatedAt: timestamp,
    } : undefined;

    await mutatePersistedState((nextPersistedState) => {
      const next = nextPersistedState.state;
      const sessions = Array.isArray(next.chatSessions) ? next.chatSessions : [];
      const existingSession = sessions.find((item) => item.id === conversationId);
      next.chatSessions = [
        existingSession
          ? { ...existingSession, provider, model, updatedAt: Math.max(existingSession.updatedAt, createdAt) }
          : session,
        ...sessions.filter((item) => item.id !== conversationId),
      ];
      const chats = Array.isArray(next.chats) ? next.chats : [];
      next.chats = [...chats.filter((item) => item.id !== userMessageId), userMessage];
      if (digestRun) upsertDigestRun(next, structuredClone(digestRun));
    });

    const job = {
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
      purpose,
      conversationId,
      userMessageId,
      assistantMessageId: randomUUID(),
      assistantCreatedAt: timestamp,
      status: 'queued',
      revision: 0,
      content: '',
      dialogueContent: [],
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
    const context = {
      config: structuredClone(config),
      model,
      messages: [...existingChats, normalizedMessage(userMessage)],
      resourceType,
      ...(book ? { book: structuredClone(book) } : {}),
      ...(rssItem ? {
        rssItem: structuredClone(rssItem),
        rssFeed: rssFeed ? structuredClone(rssFeed) : undefined,
        relatedRssItems: (Array.isArray(state.rssItems) ? state.rssItems : [])
          .filter((item) => item.feedId === rssItem.feedId && item.id !== rssItem.id)
          .sort((left, right) => right.publishedAt - left.publishedAt)
          .slice(0, 30)
          .map((item) => structuredClone(item)),
      } : {}),
      ...(video ? {
        video: structuredClone(video),
        videoTimestampNotes: (Array.isArray(state.videoTimestampNotes) ? state.videoTimestampNotes : [])
          .filter((note) => note.videoId === video.id)
          .sort((left, right) => left.timeSeconds - right.timeSeconds)
          .map((note) => structuredClone(note)),
      } : {}),
      ...(resourceType === 'rssDigest' ? {
        digestItems: digestItems.map((item) => structuredClone(item)),
        digestFeeds: digestFeeds.map((feed) => structuredClone(feed)),
        previousDigest: previousDigest ? structuredClone(previousDigest) : undefined,
      } : {}),
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
    };
    queueMicrotask(() => void executeJob(job, context));
    return publicJob(job);
  }

  async function startDigest({ date, force = false, trigger = 'manual', scheduleKey } = {}) {
    const digestDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toLocaleDateString('en-CA');
    const digestTrigger = trigger === 'schedule' ? 'schedule' : 'manual';
    const activeJob = [...jobs.values()].find((job) => (
      job.resourceType === 'rssDigest'
      && job.digestDate === digestDate
      && (job.status === 'queued' || job.status === 'running')
    ));
    if (activeJob) return { job: publicJob(activeJob), skipped: false };

    const persistedState = await readPersistedState();
    if (!persistedState?.state) throw statusError(409, '服务端尚未初始化');
    const state = persistedState.state;
    const digestRunId = randomUUID();
    const attemptedAt = Date.now();
    const persistAttempt = async ({ status, message, model, itemCount = 0 }) => {
      const completed = status !== 'queued' && status !== 'running';
      await mutatePersistedState((nextPersistedState) => {
        nextPersistedState.state.rssDigestSettings = {
          ...(nextPersistedState.state.rssDigestSettings || {}),
          lastAttemptAt: attemptedAt,
          lastError: status === 'failed' ? message : undefined,
          ...(scheduleKey ? { lastScheduledKey: scheduleKey } : {}),
        };
        upsertDigestRun(nextPersistedState.state, {
          id: digestRunId,
          date: digestDate,
          trigger: digestTrigger,
          status,
          ...(scheduleKey ? { scheduleKey } : {}),
          ...(model ? { model } : {}),
          itemCount,
          startedAt: attemptedAt,
          updatedAt: attemptedAt,
          ...(completed ? { completedAt: attemptedAt } : {}),
          ...(message ? { message } : {}),
        });
      });
    };
    const settings = state.rssDigestSettings || {};
    const configuredProvider = typeof settings.provider === 'string' && settings.provider.startsWith('api:')
      ? settings.provider
      : null;
    const provider = configuredProvider || state.aiPreferences?.provider;
    const configId = typeof provider === 'string' ? provider.slice('api:'.length) : '';
    const configs = Array.isArray(state.openAIConfigs) ? state.openAIConfigs : [];
    const config = configs.find((item) => item.id === configId) || (!configuredProvider ? configs[0] : undefined);
    const configuredModel = typeof settings.model === 'string' && settings.model.trim() ? settings.model : '';
    const model = configuredModel
      ? config?.models?.includes(configuredModel) ? configuredModel : undefined
      : config?.models?.includes(state.aiPreferences?.model)
        ? state.aiPreferences.model
        : config?.models?.[0];
    if (!config || !model) {
      const message = '请先为 RSS 日报选择可用的模型';
      await persistAttempt({ status: 'failed', message, model: configuredModel });
      throw statusError(409, message);
    }

    const dayStart = new Date(`${digestDate}T00:00:00`).getTime();
    const dayEnd = new Date(`${digestDate}T23:59:59.999`).getTime();
    if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) throw statusError(400, '日报日期不正确');
    const allItems = Array.isArray(state.rssItems) ? state.rssItems : [];
    const dayItems = allItems.filter((item) => (
      item.publishedAt >= dayStart && item.publishedAt <= dayEnd
    ));
    const previous = (Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : [])
      .find((digest) => digest.date === digestDate);
    const previousIds = new Set(previous?.sourceItemIds || []);
    const newItems = dayItems.filter((item) => !previousIds.has(item.id));
    if (!force && previous && !newItems.length) {
      await persistAttempt({ status: 'skipped', message: '没有新的内容', model });
      return { skipped: true };
    }
    const includedIds = new Set([...(previous?.sourceItemIds || []), ...dayItems.map((item) => item.id)]);
    const digestItems = allItems
      .filter((item) => includedIds.has(item.id))
      .sort((left, right) => right.publishedAt - left.publishedAt);
    if (!digestItems.length) {
      const message = '这一天还没有可整理的内容';
      if (digestTrigger === 'schedule') {
        await persistAttempt({ status: 'skipped', message, model });
        return { skipped: true };
      }
      await persistAttempt({ status: 'failed', message, model });
      throw statusError(409, message);
    }

    await mutatePersistedState((nextPersistedState) => {
      nextPersistedState.state.rssDigestSettings = {
        ...(nextPersistedState.state.rssDigestSettings || {}),
        lastAttemptAt: attemptedAt,
        lastError: undefined,
        ...(scheduleKey ? { lastScheduledKey: scheduleKey } : {}),
      };
    });
    const configuredPrompt = optionalString(settings.prompt, 12_000).trim();
    const legacyDefaultPrompt = '请把当天尚未读过的 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';
    const prompt = configuredPrompt && configuredPrompt !== legacyDefaultPrompt
      ? configuredPrompt
      : '请把当天全部 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';
    const createdAt = Date.now();
    try {
      const job = await start({
        configId: config.id,
        model,
        bookId: `rss-digest:${digestDate}`,
        resourceType: 'rssDigest',
        purpose: 'digest',
        digestDate,
        digestItemIds: digestItems.map((item) => item.id),
        digestRunId,
        digestRunStartedAt: attemptedAt,
        digestTrigger,
        digestScheduleKey: scheduleKey,
        conversationId: `rss-digest:${digestDate}`,
        userMessage: {
          id: randomUUID(),
          content: [
            prompt,
            '',
            `日报日期：${digestDate}`,
            `本次触发方式：${digestTrigger === 'schedule' ? '定时任务' : '手动生成'}`,
            '先读取当天全部条目与上一版日报，再输出可直接阅读的完整日报。',
          ].join('\n'),
          createdAt,
        },
        session: { title: `${digestDate} RSS 日报`, createdAt },
        currentText: '',
      });
      return { job, skipped: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : '日报任务启动失败';
      await persistAttempt({ status: 'failed', message, model, itemCount: digestItems.length });
      throw error;
    }
  }

  function get(id) {
    const job = jobs.get(id);
    if (!job) throw statusError(404, 'AI 任务不存在或已过期');
    return publicJob(job);
  }

  function list({ bookId, conversationId } = {}) {
    pruneJobs();
    return [...jobs.values()]
      .filter((job) => !bookId || job.bookId === bookId)
      .filter((job) => !conversationId || job.conversationId === conversationId)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(publicJob);
  }

  function cancel(id) {
    const job = jobs.get(id);
    if (!job) throw statusError(404, 'AI 任务不存在或已过期');
    if (job.status === 'queued' || job.status === 'running') {
      job.controller.abort();
      job.status = 'cancelled';
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      if (job.resourceType === 'rssDigest') {
        void updateDigestRun(job.digestRunId, {
          status: 'cancelled',
          completedAt: job.completedAt,
          message: '任务已取消',
        }).catch(() => undefined);
      }
      job.revision += 1;
      publishJob(job);
    }
    return publicJob(job);
  }

  function protectPersistedState(persistedState) {
    const state = persistedState?.state;
    if (!state) return persistedState;
    const sessions = Array.isArray(state.chatSessions) ? state.chatSessions : [];
    const chats = Array.isArray(state.chats) ? state.chats : [];
    let rssItems = Array.isArray(state.rssItems) ? state.rssItems : [];
    let rssDailyDigests = Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : [];
    for (const job of jobs.values()) {
      const hasSession = sessions.some((session) => session.id === job.conversationId);
      const resumableRssTask = job.resourceType === 'rss'
        && (job.purpose === 'summary' || job.purpose === 'translation')
        && rssItems.some((item) => item.id === job.rssItemId);
      const resumableDigest = job.resourceType === 'rssDigest' && job.purpose === 'digest';
      if (!hasSession && !resumableRssTask && !resumableDigest) continue;
      if (!hasSession) sessions.push(structuredClone(job.session));
      if (!chats.some((message) => message.id === job.userMessage.id)) {
        chats.push(structuredClone(job.userMessage));
      }
      if (
        job.finalResult
        && !chats.some((message) => message.id === job.assistantMessageId)
      ) {
        chats.push({
          id: job.assistantMessageId,
          bookId: job.bookId,
          conversationId: job.conversationId,
          role: 'assistant',
          content: job.finalResult.content,
          dialogueContent: structuredClone(job.finalResult.dialogueContent),
          createdAt: job.assistantCreatedAt,
        });
      }
      if (job.resourceType === 'rss' && job.purpose === 'summary' && job.finalResult) {
        rssItems = rssItems.map((item) => (
          item.id === job.rssItemId
            ? {
              ...item,
              aiSummary: job.finalResult.content,
              aiSummaryUpdatedAt: job.assistantCreatedAt,
              aiSummaryVersion: 2,
            }
            : item
        ));
      }
      if (job.resourceType === 'rss' && job.purpose === 'translation' && job.finalResult) {
        rssItems = rssItems.map((item) => (
          item.id === job.rssItemId
            ? {
              ...item,
              aiTranslation: job.finalResult.content,
              aiTranslationUpdatedAt: job.assistantCreatedAt,
              aiTranslationSourceFetchedAt: Number(item.fullContentFetchedAt || item.fetchedAt || 0),
            }
            : item
        ));
      }
      if (job.resourceType === 'rssDigest' && job.purpose === 'digest' && job.finalResult) {
        const previous = rssDailyDigests.find((digest) => digest.date === job.digestDate);
        const digest = {
          id: `rss-digest:${job.digestDate}`,
          date: job.digestDate,
          content: job.finalResult.content,
          sourceItemIds: job.digestItems.map((item) => item.id),
          sourceFeedIds: [...new Set(job.digestItems.map((item) => item.feedId))],
          itemCount: job.digestItems.length,
          model: job.model,
          generatedAt: previous?.generatedAt || job.assistantCreatedAt,
          updatedAt: job.assistantCreatedAt,
        };
        rssDailyDigests = [digest, ...rssDailyDigests.filter((item) => item.id !== digest.id)]
          .sort((left, right) => right.date.localeCompare(left.date));
      }
    }
    state.chatSessions = sessions;
    state.chats = chats;
    state.rssItems = rssItems;
    state.rssDailyDigests = rssDailyDigests;
    return persistedState;
  }

  return { start, startDigest, get, list, cancel, subscribe, protectPersistedState };
}

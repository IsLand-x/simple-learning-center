import { randomUUID } from 'node:crypto';
import { runServerAiChat } from './aiChat.mjs';
import { statusError } from './errors.mjs';
import { mutatePersistedState, readPersistedState } from './storage.mjs';

const JOB_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_RETAINED_JOBS = 100;

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
    });
  }

  async function executeJob(job, context) {
    if (job.status === 'cancelled') return;
    job.status = 'running';
    job.updatedAt = Date.now();
    job.revision += 1;
    publishJob(job);
    try {
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
      job.revision += 1;
      publishJob(job);
    } finally {
      pruneJobs();
    }
  }

  async function start(input) {
    pruneJobs();
    const configId = requiredString(input?.configId, '模型配置', 200);
    const model = requiredString(input?.model, '模型名称', 300);
    const bookId = requiredString(input?.bookId, '书籍', 200);
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
    const book = (Array.isArray(state.books) ? state.books : []).find((item) => item.id === bookId);
    if (!book) throw statusError(404, '找不到当前书籍');

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
    });

    const timestamp = Date.now();
    const job = {
      id: randomUUID(),
      bookId,
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
      finalResult: undefined,
    };
    jobs.set(job.id, job);
    const context = {
      config: structuredClone(config),
      model,
      messages: [...existingChats, normalizedMessage(userMessage)],
      book: structuredClone(book),
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
    for (const job of jobs.values()) {
      if (!sessions.some((session) => session.id === job.conversationId)) continue;
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
    }
    state.chats = chats;
    return persistedState;
  }

  return { start, get, list, cancel, subscribe, protectPersistedState };
}

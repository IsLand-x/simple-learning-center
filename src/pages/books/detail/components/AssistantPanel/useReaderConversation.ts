import { AIChatInput, Toast } from '@douyinfe/semi-ui';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { aiApi } from '../../../../../api/ai/index';
import type { AiJob } from '../../../../../api/ai/type';
import { useReaderAiJobs } from './useReaderAiActivity';

import { waitForServerStateWrites } from '../../../../../store/serverStateStorage';
import { useLearningStore } from '../../../../../store/useLearningStore';
import type {
  AiDialogueContentItem,
  AiProvider,
  ChatMessage,
} from '../../../../../../contracts/ai';
import type { BookItem } from '../../../../../../contracts/books';
import {
  coerceAiReasoningEffort,
  requestReasoningEffort,
} from '../../../../../util/ai/aiReasoning';
import { visibleReaderAiPromptTemplates } from '../../../../../util/ai/readerAiPrompts';
import { createUuid } from '../../../../../util/uuid';
import { measureAsync } from '../../../../../util/browser/measureAsync';
import { getBookPassages } from './bookSearch';
import { makeConversationTitle, type AiStatus } from './model';
import { useReaderConversationJobs } from './useReaderConversationJobs';
import { useConversationMessages } from '../../../../../components/ai/useConversationMessages';

export function useReaderConversation({
  book,
  conversationId,
  selectedQuote,
  getCurrentText,
  onClearSelectedText,
}: {
  book: BookItem;
  conversationId: string;
  selectedQuote?: NonNullable<ChatMessage['quote']>;
  getCurrentText: () => string;
  onClearSelectedText: () => void;
}) {
  const messageLoading = useConversationMessages(book.id, conversationId);
  const { reportJob, jobs: trackedJobs, startingConversations, setStarting } = useReaderAiJobs();
  const starting = startingConversations.includes(conversationId);
  const allChats = useLearningStore((state) => state.chats);
  const allSessions = useLearningStore((state) => state.chatSessions);
  const draftText = useLearningStore(
    (state) =>
      state.conversationDrafts.find(
        (draft) => draft.resourceId === book.id && draft.conversationId === conversationId,
      )?.text ?? '',
  );
  const configs = useLearningStore((state) => state.openAIConfigs);
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const createChatSession = useLearningStore((state) => state.createChatSession);
  const updateChatSession = useLearningStore((state) => state.updateChatSession);
  const addChatMessage = useLearningStore((state) => state.addChatMessage);
  const visiblePromptTemplates = useMemo(
    () => visibleReaderAiPromptTemplates(aiPreferences.hiddenPromptTemplateIds),
    [aiPreferences.hiddenPromptTemplateIds],
  );
  const chats = useMemo(
    () =>
      allChats.filter(
        (message) => message.bookId === book.id && message.conversationId === conversationId,
      ),
    [allChats, book.id, conversationId],
  );
  const currentSession = allSessions.find((session) => session.id === conversationId);
  const provider = aiPreferences.provider;
  const selectedConfig = provider
    ? configs.find((config) => provider === `api:${config.id}`)
    : undefined;
  const model = selectedConfig?.models.includes(aiPreferences.model)
    ? aiPreferences.model
    : (selectedConfig?.models[0] ?? '');
  const reasoningEffort = coerceAiReasoningEffort(
    aiPreferences.reasoningEffort,
    selectedConfig,
    model,
  );
  const [status, setStatus] = useState<AiStatus>(() =>
    selectedConfig && model ? 'ready' : 'unavailable',
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [quote, setQuote] = useState<{ text: string; chapter: string } | null>(null);
  const [streamingAssistant, setStreamingAssistant] = useState<{
    id: string;
    role: 'assistant';
    content: string | AiDialogueContentItem[];
    status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    createdAt: number;
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof AIChatInput>>(null);
  // Acceptance can arrive after the panel remounts; follow the acknowledged draft
  // instead of clearing only the editor instance that originally sent it.
  useEffect(() => {
    if (draftText.trim()) return;
    const message = chats.filter((item) => item.role === 'user').at(-1);
    const input = inputRef.current;
    const editor = input?.getEditor();
    if (
      message &&
      editor &&
      editor.getText().replace(/\s+/g, ' ').trim() === message.content.replace(/\s+/g, ' ').trim()
    )
      input?.setContent('');
  }, [chats, draftText]);
  const pendingRequests = useRef(new Set<string>());
  const latestBook = useRef(book);
  latestBook.current = book;
  useEffect(() => {
    // Prepare the local search index while the reader is composing a question.
    // Sending retries a failed preparation and reports its error with the draft intact.
    void getBookPassages(latestBook.current).catch(() => undefined);
  }, [book.id, book.fileSize]);
  const currentConversation = useRef(conversationId);
  currentConversation.current = conversationId;
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const markRead = useLearningStore((state) => state.markChatMessagesRead);
  useEffect(() => {
    const unreadIds = chats
      .filter((message) => message.role === 'assistant' && !message.readAt)
      .map((message) => message.id);
    if (!unreadIds.length) return;
    const list = chatAreaRef.current?.querySelector<HTMLElement>('.semi-ai-chat-dialogue-list');
    if (!list) return;
    const check = () => {
      if (document.visibilityState !== 'visible' || !list.checkVisibility() || !list.clientHeight)
        return;
      if (list.scrollHeight - list.scrollTop - list.clientHeight <= 32)
        void markRead(unreadIds).catch((error: unknown) =>
          Toast.error(error instanceof Error ? error.message : '标记已读失败'),
        );
    };
    const frame = requestAnimationFrame(check);
    const observer = new ResizeObserver(check);
    observer.observe(list);
    list.addEventListener('scroll', check, { passive: true });
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      list.removeEventListener('scroll', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [chatAreaRef, chats, markRead]);
  const lastAppliedJobRef = useRef<AiJob>();
  useEffect(() => {
    if (!provider && configs[0]) {
      setAiPreferences({ provider: `api:${configs[0].id}`, model: configs[0].models[0] ?? '' });
      return;
    }
    if (!activeJobId)
      setStatus((current) => {
        if (starting || pendingRequests.current.has(conversationId)) return 'generating';
        if (!selectedConfig || !model) return 'unavailable';
        return current === 'error' ? 'error' : 'ready';
      });
    if (
      selectedConfig &&
      (model !== aiPreferences.model || reasoningEffort !== aiPreferences.reasoningEffort)
    ) {
      setAiPreferences({ model, reasoningEffort });
    }
  }, [
    activeJobId,
    starting,
    aiPreferences.model,
    aiPreferences.reasoningEffort,
    configs,
    conversationId,
    model,
    provider,
    reasoningEffort,
    selectedConfig,
    setAiPreferences,
  ]);
  useEffect(() => {
    lastAppliedJobRef.current = undefined;
    setQuote(null);
    setStreamingAssistant(null);
    setActiveJobId(null);
    setStatusMessage('');
    setStatus((current) => (current === 'error' ? 'ready' : current));
  }, [conversationId]);
  const applyJob = useReaderConversationJobs({
    book,
    conversationId,
    reportJob,
    trackedJobs,
    lastAppliedJobRef,
    activeJobId,
    setActiveJobId,
    setStreamingAssistant,
    setStatus,
    setStatusMessage,
  });
  useEffect(() => {
    if (!selectedQuote) return;
    setQuote(selectedQuote);
    onClearSelectedText();
    let attempts = 0;
    let animationFrame = 0;
    const focusInput = () => {
      const input = inputRef.current;
      if (!input?.getEditor()) {
        attempts += 1;
        if (attempts < 6) animationFrame = window.requestAnimationFrame(focusInput);
        return;
      }
      input.focusEditor('end');
    };
    animationFrame = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [onClearSelectedText, selectedQuote]);
  const chooseModel = (selection: unknown) => {
    if (status === 'generating') return;
    if (!Array.isArray(selection) || selection.length < 2) return;
    const nextProvider = String(selection[0]) as AiProvider;
    const nextModel = String(selection[1]);
    const nextConfig = configs.find((config) => nextProvider === `api:${config.id}`);
    const nextReasoningEffort = coerceAiReasoningEffort(reasoningEffort, nextConfig, nextModel);
    setStatusMessage('');
    setAiPreferences({
      provider: nextProvider,
      model: nextModel,
      reasoningEffort: nextReasoningEffort,
    });
    if (currentSession) {
      void updateChatSession(currentSession.id, {
        provider: nextProvider,
        model: nextModel,
        reasoningEffort: nextReasoningEffort,
      }).catch((error: unknown) =>
        Toast.error(error instanceof Error ? error.message : '保存对话模型失败'),
      );
    }
  };
  const chooseReasoningEffort = (nextValue: typeof reasoningEffort) => {
    if (status === 'generating') return;
    const nextReasoningEffort = coerceAiReasoningEffort(nextValue, selectedConfig, model);
    setAiPreferences({ reasoningEffort: nextReasoningEffort });
    if (currentSession) {
      void updateChatSession(currentSession.id, { reasoningEffort: nextReasoningEffort }).catch(
        (error: unknown) =>
          Toast.error(error instanceof Error ? error.message : '保存对话模型失败'),
      );
    }
  };
  const ensureSession = (question: string, timestamp: number) => {
    if (useLearningStore.getState().chatSessions.some((session) => session.id === conversationId))
      return;
    createChatSession({
      id: conversationId,
      bookId: book.id,
      title: makeConversationTitle(question),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      reasoningEffort,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };
  const send = async (content: string) => {
    const question = content.trim();
    if (!question) return;
    if (pendingRequests.current.has(conversationId) || starting) return;
    if (messageLoading.loading || messageLoading.error) return;
    const canRequest = status === 'ready' || status === 'error';
    if (!canRequest || !selectedConfig || !model) {
      Toast.warning('请先在设置中添加模型并完成接口配置');
      return;
    }
    const quoteForMessage = quote;
    const createdAt = Date.now();
    const userMessageId = createUuid();
    const userMessage = {
      id: userMessageId,
      bookId: book.id,
      conversationId,
      role: 'user' as const,
      content: question,
      ...(quoteForMessage ? { quote: quoteForMessage } : {}),
      createdAt,
    };
    pendingRequests.current.add(conversationId);
    // Keep the input (including shortcuts) recoverable until the task API has saved it.
    const store = useLearningStore.getState();
    const draftText = store.conversationDrafts.find(
      (draft) => draft.resourceId === book.id && draft.conversationId === conversationId,
    )?.text;
    if (!draftText?.trim()) {
      store.setConversationDraft(book.id, conversationId, question);
      inputRef.current?.setContent(question);
    }
    setStreamingAssistant(null);
    setStatus('generating');
    setStatusMessage('正在发送消息，等待服务端保存…');
    setStarting(conversationId, true);
    try {
      const currentText = getCurrentText();
      await Promise.all([
        measureAsync('ai:prepare-state', () =>
          waitForServerStateWrites({ ignoreConversationDrafts: true }),
        ),
        measureAsync('ai:prepare-index', () => getBookPassages(book)),
      ]);
      const job = await measureAsync('ai:accept', () =>
        aiApi.startJob({
          configId: selectedConfig.id,
          model,
          reasoningEffort: requestReasoningEffort(reasoningEffort),
          bookId: book.id,
          conversationId,
          userMessage: {
            id: userMessageId,
            content: question,
            ...(quoteForMessage ? { quote: quoteForMessage } : {}),
            createdAt,
          },
          session: {
            title: currentSession?.title || makeConversationTitle(question),
            createdAt: currentSession?.createdAt ?? createdAt,
          },
          currentText,
        }),
      );
      // chats/chatSessions are read caches, excluded from Zustand persistence.
      // A successful task response confirms that both have been saved on the server.
      ensureSession(question, createdAt);
      addChatMessage(userMessage);
      const latestStore = useLearningStore.getState();
      const latestDraft = latestStore.conversationDrafts.find(
        (draft) => draft.resourceId === book.id && draft.conversationId === conversationId,
      );
      if (latestDraft?.text.trim() === question) {
        latestStore.setConversationDraft(book.id, conversationId, '');
      }
      if (currentConversation.current === conversationId)
        setQuote((current) => (current === quoteForMessage ? null : current));
      applyJob(job);
    } catch (error) {
      if (currentConversation.current === conversationId) {
        const message = `发送未确认，输入内容已保留。${error instanceof Error ? error.message : '请求失败'}`;
        setStatus('error');
        setStatusMessage(message);
        Toast.error(message);
      }
    } finally {
      pendingRequests.current.delete(conversationId);
      setStarting(conversationId, false);
    }
  };
  const stop = () => {
    if (!activeJobId) return;
    void aiApi
      .cancelJob(activeJobId)
      .then(applyJob)
      .catch((error) => {
        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : '停止任务失败');
      });
  };
  const dialogueMessages = useMemo(
    () => [
      ...chats.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.dialogueContent?.length ? message.dialogueContent : message.content,
        ...(message.quote ? { quote: message.quote } : {}),
        createdAt: message.createdAt,
        status: 'completed',
      })),
      ...(streamingAssistant && !chats.some((message) => message.id === streamingAssistant.id)
        ? [streamingAssistant]
        : []),
    ],
    [chats, streamingAssistant],
  );
  const userTurns = dialogueMessages
    .map((message, messageIndex) => ({ message, messageIndex }))
    .filter(({ message }) => message.role === 'user');
  const canSend =
    !messageLoading.loading && !messageLoading.error && (status === 'ready' || status === 'error');
  const jumpToUserTurn = (messageIndex: number) => {
    const chatArea = chatAreaRef.current;
    const list = chatArea?.querySelector<HTMLElement>('.semi-ai-chat-dialogue-list');
    const target = list
      ?.querySelectorAll<HTMLElement>('.semi-ai-chat-dialogue-wrapper')
      .item(messageIndex);
    if (!list || !target) return;
    list.scrollTo({
      top: Math.max(0, target.offsetTop - 8),
      behavior: 'smooth',
    });
  };
  return {
    messageLoading,
    chatAreaRef,
    userTurns,
    jumpToUserTurn,
    dialogueMessages,
    provider,
    configs,
    aiPreferences,
    inputRef,
    quote,
    setQuote,
    canSend,
    status,
    send,
    stop,
    visiblePromptTemplates,
    selectedConfig,
    statusMessage,
    model,
    reasoningEffort,
    chooseModel,
    chooseReasoningEffort,
  };
}

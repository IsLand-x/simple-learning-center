import { aiApi } from '../../../../../api/ai';
import type { AiJob } from '../../../../../types/ai';
import { useReaderAiActivity } from '../../store/hooks/useReaderAiActivity';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AIChatInput, Toast } from '@douyinfe/semi-ui';

import { getBookPassages } from '../../../../../util/epub/bookSearch';
import {
  coerceAiReasoningEffort,
  requestReasoningEffort,
} from '../../../../../util/ai/aiReasoning';
import { waitForServerStateWrites } from '../../../../../util/state/serverStateStorage';
import { createUuid } from '../../../../../util/uuid';
import { visibleReaderAiPromptTemplates } from '../../../../../util/ai/readerAiPrompts';
import { useLearningStore } from '../../../../../util/state/useLearningStore';
import type {
  AiDialogueContentItem,
  AiProvider,
  BookItem,
  ChatMessage,
} from '../../../../../types/domain';
import { makeConversationTitle, type AiStatus } from '../../store/model/rightPanelModel';
import { useReaderConversationJobs } from './useReaderConversationJobs';

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
  const {
    reportJob,
    jobs: trackedJobs,
    startingConversations,
    setStarting,
  } = useReaderAiActivity();
  const starting = startingConversations.includes(conversationId);
  const allChats = useLearningStore((state) => state.chats);
  const allSessions = useLearningStore((state) => state.chatSessions);
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
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<{
    id: string;
    role: 'user';
    content: string;
    quote?: { text: string; chapter: string };
    status: 'completed';
    createdAt: number;
  } | null>(null);
  const [streamingAssistant, setStreamingAssistant] = useState<{
    id: string;
    role: 'assistant';
    content: string | AiDialogueContentItem[];
    status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    createdAt: number;
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof AIChatInput>>(null);
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
      if (list.scrollHeight - list.scrollTop - list.clientHeight <= 32) markRead(unreadIds);
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
  const synchronizedNoteRevisionsRef = useRef(new Map<string, number>());
  const noteSyncQueueRef = useRef(Promise.resolve());
  useEffect(() => {
    setStatusMessage('');
    if (!provider && configs[0]) {
      setAiPreferences({ provider: `api:${configs[0].id}`, model: configs[0].models[0] ?? '' });
      return;
    }
    if (!activeJobId)
      setStatus(starting ? 'generating' : selectedConfig && model ? 'ready' : 'unavailable');
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
    model,
    provider,
    reasoningEffort,
    selectedConfig,
    setAiPreferences,
  ]);
  useEffect(() => {
    setQuote(null);
    setOptimisticUserMessage(null);
    setStreamingAssistant(null);
    setActiveJobId(null);
  }, [conversationId]);
  const applyJob = useReaderConversationJobs({
    book,
    conversationId,
    reportJob,
    trackedJobs,
    lastAppliedJobRef,
    synchronizedNoteRevisionsRef,
    noteSyncQueueRef,
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
      updateChatSession(currentSession.id, {
        provider: nextProvider,
        model: nextModel,
        reasoningEffort: nextReasoningEffort,
      });
    }
  };
  const chooseReasoningEffort = (nextValue: typeof reasoningEffort) => {
    if (status === 'generating') return;
    const nextReasoningEffort = coerceAiReasoningEffort(nextValue, selectedConfig, model);
    setAiPreferences({ reasoningEffort: nextReasoningEffort });
    if (currentSession) {
      updateChatSession(currentSession.id, { reasoningEffort: nextReasoningEffort });
    }
  };
  const ensureSession = (question: string) => {
    if (currentSession) return;
    const timestamp = Date.now();
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
    const canRequest = status === 'ready' || status === 'error';
    if (!canRequest) {
      Toast.warning('请先在设置中添加模型并完成接口配置');
      return;
    }
    const quoteForMessage = quote;
    ensureSession(question);
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
    setOptimisticUserMessage({
      id: userMessage.id,
      role: userMessage.role,
      content: userMessage.content,
      ...(userMessage.quote ? { quote: userMessage.quote } : {}),
      status: 'completed',
      createdAt: userMessage.createdAt,
    });
    addChatMessage(userMessage);
    setQuote(null);

    if (!selectedConfig || !model) return;
    const temporaryAssistantId = `pending:${userMessageId}`;
    setStreamingAssistant({
      id: temporaryAssistantId,
      role: 'assistant',
      content: [],
      status: 'queued',
      createdAt,
    });
    setStatus('generating');
    setStatusMessage('');
    setStarting(conversationId, true);
    const currentText = getCurrentText();
    try {
      await getBookPassages(book);
      await waitForServerStateWrites();
      const job = await aiApi.startJob({
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
      });
      applyJob(job);
    } catch (error) {
      setStreamingAssistant((message) => (message ? { ...message, status: 'failed' } : null));
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '请求失败');
      Toast.error(error instanceof Error ? error.message : '请求失败');
    } finally {
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
  const dialogueMessages = [
    ...chats.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.dialogueContent?.length ? message.dialogueContent : message.content,
      ...(message.quote ? { quote: message.quote } : {}),
      createdAt: message.createdAt,
      status: 'completed',
    })),
    ...(optimisticUserMessage && !chats.some((message) => message.id === optimisticUserMessage.id)
      ? [optimisticUserMessage]
      : []),
    ...(streamingAssistant && !chats.some((message) => message.id === streamingAssistant.id)
      ? [streamingAssistant]
      : []),
  ];
  const userTurns = dialogueMessages
    .map((message, messageIndex) => ({ message, messageIndex }))
    .filter(({ message }) => message.role === 'user');
  const canSend = status === 'ready' || status === 'error';
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

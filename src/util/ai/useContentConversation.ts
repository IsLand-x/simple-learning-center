import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AIChatInput, Toast } from '@douyinfe/semi-ui';
import { cancelAiJob, startAiJob } from './aiJobs';
import { coerceAiReasoningEffort, requestReasoningEffort } from './aiReasoning';
import { waitForServerStateWrites } from '../state/serverStateStorage';
import { createUuid } from '../uuid';
import { useLearningStore } from '../state/useLearningStore';
import type { AiDialogueContentItem, AiProvider, RssItem, VideoResource } from '../types';
import { useContentConversationJobs } from './useContentConversationJobs';

type AiStatus = 'unavailable' | 'ready' | 'generating' | 'error';

function makeConversationTitle(content: string) {
  const title =
    content
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '关于当前内容的对话';
  return title.replace(/\s+/g, ' ').slice(0, 32);
}

export function useContentConversation({
  resource,
  selectedText,
  onClearSelectedText,
}: {
  resource: { type: 'rss'; item: RssItem } | { type: 'video'; video: VideoResource };
  selectedText?: string;
  onClearSelectedText?: () => void;
}) {
  const isVideo = resource.type === 'video';
  const resourceTitle = isVideo ? resource.video.title : resource.item.title;
  const rawResourceId = isVideo ? resource.video.id : resource.item.id;
  const resourceId = `${resource.type}:${rawResourceId}`;
  const conversationId = `${resource.type}-chat:${rawResourceId}`;
  const allChats = useLearningStore((state) => state.chats);
  const allSessions = useLearningStore((state) => state.chatSessions);
  const configs = useLearningStore((state) => state.openAIConfigs);
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const createChatSession = useLearningStore((state) => state.createChatSession);
  const updateChatSession = useLearningStore((state) => state.updateChatSession);
  const addChatMessage = useLearningStore((state) => state.addChatMessage);
  const chats = useMemo(
    () =>
      allChats.filter(
        (message) => message.bookId === resourceId && message.conversationId === conversationId,
      ),
    [allChats, conversationId, resourceId],
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
  useEffect(() => {
    setStatusMessage('');
    if (!provider && configs[0]) {
      setAiPreferences({ provider: `api:${configs[0].id}`, model: configs[0].models[0] ?? '' });
      return;
    }
    if (!activeJobId) setStatus(selectedConfig && model ? 'ready' : 'unavailable');
    if (
      selectedConfig &&
      (model !== aiPreferences.model || reasoningEffort !== aiPreferences.reasoningEffort)
    ) {
      setAiPreferences({ model, reasoningEffort });
    }
  }, [
    activeJobId,
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
    setStatusMessage('');
  }, [conversationId]);
  useEffect(() => {
    const text = selectedText?.trim();
    if (!text) return;
    setQuote({ text, chapter: resourceTitle });
    onClearSelectedText?.();
    const animationFrame = window.requestAnimationFrame(() => inputRef.current?.focusEditor('end'));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [onClearSelectedText, resourceTitle, selectedText]);
  const applyJob = useContentConversationJobs({
    resourceId,
    conversationId,
    activeJobId,
    setActiveJobId,
    setStreamingAssistant,
    setStatus,
    setStatusMessage,
  });
  const chooseModel = (selection: unknown) => {
    if (status === 'generating' || !Array.isArray(selection) || selection.length < 2) return;
    const nextProvider = String(selection[0]) as AiProvider;
    const nextModel = String(selection[1]);
    const nextConfig = configs.find((config) => nextProvider === `api:${config.id}`);
    const nextReasoningEffort = coerceAiReasoningEffort(reasoningEffort, nextConfig, nextModel);
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
      bookId: resourceId,
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
    if (status !== 'ready' && status !== 'error') {
      Toast.warning('请先在设置中添加并选择模型');
      return;
    }
    const quoteForMessage = quote;
    ensureSession(question);
    const createdAt = Date.now();
    const userMessageId = createUuid();
    const userMessage = {
      id: userMessageId,
      bookId: resourceId,
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
    setStreamingAssistant({
      id: `pending:${userMessageId}`,
      role: 'assistant',
      content: [],
      status: 'queued',
      createdAt,
    });
    setStatus('generating');
    setStatusMessage('');
    try {
      await waitForServerStateWrites();
      applyJob(
        await startAiJob({
          configId: selectedConfig.id,
          model,
          reasoningEffort: requestReasoningEffort(reasoningEffort),
          bookId: resourceId,
          resourceType: resource.type,
          ...(resource.type === 'rss'
            ? { rssItemId: resource.item.id }
            : { videoId: resource.video.id }),
          purpose: 'chat',
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
          currentText: '',
        }),
      );
    } catch (error) {
      setStreamingAssistant((message) => (message ? { ...message, status: 'failed' } : null));
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '请求失败');
    }
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
  const canSend = status === 'ready' || status === 'error';
  const stop = () => {
    if (!activeJobId) return;
    void cancelAiJob(activeJobId)
      .then(applyJob)
      .catch((error) => {
        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : '停止任务失败');
      });
  };
  return {
    isVideo,
    resourceTitle,
    dialogueMessages,
    provider,
    configs,
    inputRef,
    quote,
    setQuote,
    canSend,
    status,
    send,
    stop,
    statusMessage,
    model,
    chooseModel,
    selectedConfig,
    reasoningEffort,
    chooseReasoningEffort,
  };
}

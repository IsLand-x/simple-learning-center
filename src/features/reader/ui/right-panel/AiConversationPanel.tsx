import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AIChatInput, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconBookOpenStroked } from '@douyinfe/semi-icons';
import {
  cancelAiJob,
  getAiJob,
  listAiJobs,
  startAiJob,
  watchAiJob,
  type AiJob,
} from '../../../../lib/aiJobs';
import { getBookPassages } from '../../../../lib/bookSearch';
import { synchronizeLearningState } from '../../../../lib/learningStateSync';
import { waitForServerStateWrites } from '../../../../lib/serverStateStorage';
import { createUuid } from '../../../../lib/uuid';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { AiDialogueContentItem, AiProvider, BookItem } from '../../../../types';
import {
  AiConversationDialogue,
  AiModelSelector,
} from '../../../../components/AiConversationPrimitives';
import {
  extractInputText,
  makeConversationTitle,
  providerLabel,
  type AiStatus,
} from '../../model/rightPanelModel';

const { Text } = Typography;

export function AiConversationPanel({
  book,
  conversationId,
  selectedText,
  getCurrentText,
  onClearSelectedText,
}: {
  book: BookItem;
  conversationId: string;
  selectedText?: string;
  getCurrentText: () => string;
  onClearSelectedText: () => void;
}) {
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
  const synchronizedNoteRevisionsRef = useRef(new Map<string, number>());
  const noteSyncQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    setStatusMessage('');
    if (!provider && configs[0]) {
      setAiPreferences({ provider: `api:${configs[0].id}`, model: configs[0].models[0] ?? '' });
      return;
    }
    if (!activeJobId) setStatus(selectedConfig && model ? 'ready' : 'unavailable');
    if (selectedConfig && model !== aiPreferences.model) setAiPreferences({ model });
  }, [
    activeJobId,
    aiPreferences.model,
    configs,
    model,
    provider,
    selectedConfig,
    setAiPreferences,
  ]);

  useEffect(() => {
    setQuote(null);
    setOptimisticUserMessage(null);
    setStreamingAssistant(null);
    setActiveJobId(null);
  }, [conversationId]);

  const applyJob = useCallback((job: AiJob) => {
    const notesRevision = Number(job.notesRevision || 0);
    const synchronizedRevision = synchronizedNoteRevisionsRef.current.get(job.id) ?? 0;
    if (notesRevision > synchronizedRevision) {
      synchronizedNoteRevisionsRef.current.set(job.id, notesRevision);
      noteSyncQueueRef.current = noteSyncQueueRef.current
        .catch(() => undefined)
        .then(() => synchronizeLearningState());
      void noteSyncQueueRef.current.catch((error) => {
        console.warn('同步 AI 修改的阅读笔记失败', error);
      });
    }
    if (job.status === 'queued' || job.status === 'running') {
      setActiveJobId(job.id);
      setStreamingAssistant({
        id: job.assistantMessageId,
        role: 'assistant',
        content: job.dialogueContent?.length ? job.dialogueContent : job.content,
        status: job.status === 'queued' ? 'queued' : 'in_progress',
        createdAt: job.createdAt,
      });
      setStatus('generating');
      setStatusMessage('');
      return;
    }
    setActiveJobId(null);
    if (job.status === 'completed') {
      const store = useLearningStore.getState();
      if (!store.chats.some((message) => message.id === job.assistantMessageId)) {
        store.addChatMessage({
          id: job.assistantMessageId,
          bookId: job.bookId,
          conversationId: job.conversationId,
          role: 'assistant',
          content: job.content,
          dialogueContent: job.dialogueContent,
          createdAt: job.createdAt,
        });
      }
      setStreamingAssistant(null);
      setStatus('ready');
      setStatusMessage('');
      return;
    }
    if (job.status === 'cancelled') {
      setStreamingAssistant(null);
      setStatus('ready');
      setStatusMessage('已停止生成');
      return;
    }
    setStreamingAssistant({
      id: job.assistantMessageId,
      role: 'assistant',
      content: job.dialogueContent?.length ? job.dialogueContent : job.content,
      status: 'failed',
      createdAt: job.createdAt,
    });
    setStatus('error');
    setStatusMessage(job.error || '模型请求失败');
  }, []);

  useEffect(() => {
    let disposed = false;
    void listAiJobs(book.id, conversationId)
      .then((jobs) => {
        if (disposed) return;
        jobs
          .filter((job) => job.status === 'completed')
          .sort((left, right) => left.createdAt - right.createdAt)
          .forEach(applyJob);
        const runningJob = jobs.find((job) => job.status === 'queued' || job.status === 'running');
        if (runningJob) applyJob(runningJob);
      })
      .catch((error) => {
        if (!disposed)
          setStatusMessage(error instanceof Error ? error.message : '无法读取服务端任务');
      });
    return () => {
      disposed = true;
    };
  }, [applyJob, book.id, conversationId]);

  useEffect(() => {
    if (!activeJobId) return undefined;
    let disposed = false;
    let timer = 0;
    let polling = false;
    let animationFrame = 0;
    let latestStreamedJob: AiJob | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const job = await getAiJob(activeJobId);
        if (disposed) return;
        applyJob(job);
        if (job.status === 'queued' || job.status === 'running') {
          timer = window.setTimeout(poll, 1_000);
        }
      } catch (error) {
        if (disposed) return;
        setActiveJobId(null);
        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : '无法读取服务端任务');
      }
    };
    const startPolling = () => {
      if (disposed || polling) return;
      polling = true;
      void poll();
    };
    const applyStreamedJob = (job: AiJob) => {
      latestStreamedJob = job;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const latestJob = latestStreamedJob;
        latestStreamedJob = undefined;
        if (!disposed && latestJob) applyJob(latestJob);
      });
    };
    timer = window.setTimeout(startPolling, 1_000);
    void watchAiJob(
      activeJobId,
      (job) => {
        if (!disposed) applyStreamedJob(job);
      },
      controller.signal,
    ).catch((error) => {
      if (disposed || (error instanceof Error && error.name === 'AbortError')) return;
      startPolling();
    });
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeJobId, applyJob]);

  useEffect(() => {
    if (!selectedText) return;
    setQuote({ text: selectedText, chapter: book.currentChapter || '当前章节' });
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
  }, [book.currentChapter, onClearSelectedText, selectedText]);

  const chooseModel = (selection: unknown) => {
    if (status === 'generating') return;
    if (!Array.isArray(selection) || selection.length < 2) return;
    const nextProvider = String(selection[0]) as AiProvider;
    const nextModel = String(selection[1]);
    setStatusMessage('');
    setAiPreferences({ provider: nextProvider, model: nextModel });
    if (currentSession)
      updateChatSession(currentSession.id, { provider: nextProvider, model: nextModel });
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
    try {
      await getBookPassages(book);
      await waitForServerStateWrites();
      const job = await startAiJob({
        configId: selectedConfig.id,
        model,
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
        currentText: getCurrentText(),
      });
      applyJob(job);
    } catch (error) {
      setStreamingAssistant((message) => (message ? { ...message, status: 'failed' } : null));
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '请求失败');
    }
  };

  const stop = () => {
    if (!activeJobId) return;
    void cancelAiJob(activeJobId)
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

  return (
    <div className="right-panel__body ai-panel">
      <div
        ref={chatAreaRef}
        className={`semi-chat-area${userTurns.length ? ' semi-chat-area--with-turn-nav' : ''}`}
        aria-live="polite"
      >
        {userTurns.length > 0 && (
          <nav className="chat-turn-nav" aria-label="用户消息快速导航">
            {userTurns.map(({ message, messageIndex }, turnIndex) => {
              const preview =
                typeof message.content === 'string'
                  ? message.content.replace(/\s+/g, ' ').trim()
                  : `第 ${turnIndex + 1} 轮用户消息`;
              const tooltip = preview.length > 160 ? `${preview.slice(0, 160)}…` : preview;
              return (
                <Tooltip
                  key={message.id}
                  content={
                    <span className="chat-turn-nav__preview">
                      {tooltip || `第 ${turnIndex + 1} 轮用户消息`}
                    </span>
                  }
                  position="right"
                >
                  <button
                    aria-label={`跳转到第 ${turnIndex + 1} 轮用户消息：${tooltip}`}
                    className="chat-turn-nav__item"
                    type="button"
                    onClick={() => jumpToUserTurn(messageIndex)}
                  >
                    <span aria-hidden="true" />
                  </button>
                </Tooltip>
              );
            })}
          </nav>
        )}
        <AiConversationDialogue
          chats={dialogueMessages}
          assistantName={providerLabel(provider ?? undefined, configs)}
          emptyTitle="开始新的对话"
          emptyDescription="Agent 会按需检索整本书、学习记录与联网资料"
        />
      </div>

      <AIChatInput
        ref={inputRef}
        references={
          quote
            ? [
                {
                  id: 'reader-selection',
                  type: 'text',
                  content: `书中引用 · ${quote.chapter}：${quote.text}`,
                },
              ]
            : []
        }
        showReference
        onReferenceDelete={() => setQuote(null)}
        keepSkillAfterSend={false}
        placeholder={canSend ? '输入关于本书的问题…' : '添加并选择模型后开始提问'}
        canSend={canSend}
        generating={status === 'generating'}
        onMessageSend={({ inputContents }) =>
          void send(extractInputText(inputContents as Array<Record<string, unknown>>))
        }
        onStopGenerate={stop}
        showUploadButton={false}
        showTemplateButton={false}
        round
        renderTopSlot={() => (
          <div className="ai-composer-context">
            <div className="ai-composer-context__row">
              <Tooltip
                content="Agent 可按需读取章节、搜索整本书，并在已配置时联网检索"
                position="topLeft"
              >
                <div
                  className="ai-book-context"
                  aria-label={`当前书籍《${book.title}》，已自动提供阅读工具`}
                >
                  <IconBookOpenStroked size="small" />
                  <Text size="small" ellipsis={{ showTooltip: true }}>
                    《{book.title}》 · {book.currentChapter || '当前章节'}
                  </Text>
                </div>
              </Tooltip>
            </div>
            {(statusMessage || status === 'unavailable') && (
              <Text
                size="small"
                type={status === 'error' ? 'danger' : 'tertiary'}
                className="ai-composer-message"
              >
                {statusMessage || '请先到设置页添加 OpenAI 兼容模型。'}
              </Text>
            )}
          </div>
        )}
        renderConfigureArea={() => (
          <AiModelSelector
            configs={configs}
            provider={provider}
            model={model}
            disabled={status === 'generating'}
            onChange={chooseModel}
          />
        )}
        className="reader-ai-input"
      />
    </div>
  );
}

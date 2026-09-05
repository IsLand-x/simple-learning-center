import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AIChatInput, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconArticle, IconVideo } from '@douyinfe/semi-icons';
import {
  cancelAiJob,
  getAiJob,
  listAiJobs,
  startAiJob,
  watchAiJob,
  type AiJob,
} from '../lib/aiJobs';
import { waitForServerStateWrites } from '../lib/serverStateStorage';
import { createUuid } from '../lib/uuid';
import { useLearningStore } from '../store/useLearningStore';
import type { AiDialogueContentItem, AiProvider, RssItem, VideoResource } from '../types';
import { AiConversationDialogue, AiModelSelector } from './AiConversationPrimitives';

const { Text } = Typography;

type AiStatus = 'unavailable' | 'ready' | 'generating' | 'error';

function extractInputText(inputContents?: Array<Record<string, unknown>>) {
  return (inputContents ?? [])
    .map((item) => item.type === 'text' && typeof item.text === 'string' ? item.text : '')
    .join('')
    .trim();
}

function providerLabel(provider: AiProvider | undefined, configs: ReturnType<typeof useLearningStore.getState>['openAIConfigs']) {
  if (!provider) return 'AI';
  return configs.find((config) => provider === `api:${config.id}`)?.name ?? 'AI';
}

function makeConversationTitle(content: string) {
  const title = content.split('\n').map((line) => line.trim()).find(Boolean) || '关于当前内容的对话';
  return title.replace(/\s+/g, ' ').slice(0, 32);
}

function LearningResourceAiPanel({
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
    () => allChats.filter((message) => message.bookId === resourceId && message.conversationId === conversationId),
    [allChats, conversationId, resourceId],
  );
  const currentSession = allSessions.find((session) => session.id === conversationId);
  const provider = aiPreferences.provider;
  const selectedConfig = provider
    ? configs.find((config) => provider === `api:${config.id}`)
    : undefined;
  const model = selectedConfig?.models.includes(aiPreferences.model)
    ? aiPreferences.model
    : selectedConfig?.models[0] ?? '';
  const [status, setStatus] = useState<AiStatus>(() => selectedConfig && model ? 'ready' : 'unavailable');
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

  useEffect(() => {
    setStatusMessage('');
    if (!provider && configs[0]) {
      setAiPreferences({ provider: `api:${configs[0].id}`, model: configs[0].models[0] ?? '' });
      return;
    }
    if (!activeJobId) setStatus(selectedConfig && model ? 'ready' : 'unavailable');
    if (selectedConfig && model !== aiPreferences.model) setAiPreferences({ model });
  }, [activeJobId, aiPreferences.model, configs, model, provider, selectedConfig, setAiPreferences]);

  useEffect(() => {
    setQuote(null);
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

  const applyJob = useCallback((job: AiJob) => {
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
    setStreamingAssistant((message) => ({
      id: message?.id ?? job.assistantMessageId,
      role: 'assistant',
      content: job.dialogueContent?.length ? job.dialogueContent : job.content,
      status: 'failed',
      createdAt: message?.createdAt ?? job.createdAt,
    }));
    setStatus('error');
    setStatusMessage(job.error || '模型请求失败');
  }, []);

  useEffect(() => {
    let disposed = false;
    void listAiJobs(resourceId, conversationId).then((jobs) => {
      if (disposed) return;
      const runningJob = jobs.find((job) => job.status === 'queued' || job.status === 'running');
      if (runningJob) applyJob(runningJob);
    }).catch((error) => {
      if (!disposed) setStatusMessage(error instanceof Error ? error.message : '无法读取服务端任务');
    });
    return () => {
      disposed = true;
    };
  }, [applyJob, conversationId, resourceId]);

  useEffect(() => {
    if (!activeJobId) return undefined;
    let disposed = false;
    let timer = 0;
    let polling = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const job = await getAiJob(activeJobId);
        if (disposed) return;
        applyJob(job);
        if (job.status === 'queued' || job.status === 'running') timer = window.setTimeout(poll, 1_000);
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
    timer = window.setTimeout(startPolling, 1_000);
    void watchAiJob(activeJobId, (job) => {
      if (!disposed) applyJob(job);
    }, controller.signal).catch((error) => {
      if (disposed || (error instanceof Error && error.name === 'AbortError')) return;
      startPolling();
    });
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeJobId, applyJob]);

  const chooseModel = (selection: unknown) => {
    if (status === 'generating' || !Array.isArray(selection) || selection.length < 2) return;
    const nextProvider = String(selection[0]) as AiProvider;
    const nextModel = String(selection[1]);
    setAiPreferences({ provider: nextProvider, model: nextModel });
    if (currentSession) updateChatSession(currentSession.id, { provider: nextProvider, model: nextModel });
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
    addChatMessage({
      id: userMessageId,
      bookId: resourceId,
      conversationId,
      role: 'user',
      content: question,
      ...(quoteForMessage ? { quote: quoteForMessage } : {}),
      createdAt,
    });
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
      applyJob(await startAiJob({
        configId: selectedConfig.id,
        model,
        bookId: resourceId,
        resourceType: resource.type,
        ...(resource.type === 'rss' ? { rssItemId: resource.item.id } : { videoId: resource.video.id }),
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
      }));
    } catch (error) {
      setStreamingAssistant((message) => message ? { ...message, status: 'failed' } : null);
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
    ...(streamingAssistant && !chats.some((message) => message.id === streamingAssistant.id)
      ? [streamingAssistant]
      : []),
  ];
  const canSend = status === 'ready' || status === 'error';

  return (
    <div className="right-panel__body ai-panel rss-ai-panel">
      <div className="semi-chat-area rss-ai-panel__dialogue" aria-live="polite">
        <AiConversationDialogue
          chats={dialogueMessages}
          assistantName={providerLabel(provider ?? undefined, configs)}
          emptyTitle={isVideo ? '询问当前视频' : '询问当前内容'}
          emptyDescription={isVideo ? 'AI 可以读取字幕、结合时间点笔记总结和解释视频' : 'AI 可以读取正文、比较同一订阅源的近期内容，并按需联网核对'}
        />
      </div>
      <AIChatInput
        ref={inputRef}
        references={quote ? [{
          id: 'rss-selection',
          type: 'text',
          content: `${isVideo ? '字幕引用' : '文章引用'} · ${resourceTitle}：${quote.text}`,
        }] : []}
        showReference
        onReferenceDelete={() => setQuote(null)}
        keepSkillAfterSend={false}
        placeholder={isVideo ? '询问这个视频…' : '询问这篇内容…'}
        canSend={canSend}
        generating={status === 'generating'}
        onMessageSend={({ inputContents }) => void send(extractInputText(inputContents as Array<Record<string, unknown>>))}
        onStopGenerate={() => {
          if (!activeJobId) return;
          void cancelAiJob(activeJobId).then(applyJob).catch((error) => {
            setStatus('error');
            setStatusMessage(error instanceof Error ? error.message : '停止任务失败');
          });
        }}
        showUploadButton={false}
        showTemplateButton={false}
        round
        renderTopSlot={() => (
          <div className="ai-composer-context">
            <div className="ai-composer-context__row">
              <Tooltip content={isVideo ? 'AI 可读取当前视频字幕与时间点笔记' : 'AI 可读取当前 RSS 正文与同一来源的近期内容'} position="topLeft">
                <div className="ai-book-context" aria-label={`当前${isVideo ? '视频' : ' RSS 内容'}：${resourceTitle}`}>
                  {isVideo ? <IconVideo size="small" /> : <IconArticle size="small" />}
                  <Text size="small" ellipsis={{ showTooltip: true }}>{resourceTitle}</Text>
                </div>
              </Tooltip>
            </div>
            {(statusMessage || status === 'unavailable') && (
              <Text size="small" type={status === 'error' ? 'danger' : 'tertiary'} className="ai-composer-message">
                {statusMessage || '请先到设置页添加 OpenAI 兼容模型。'}
              </Text>
            )}
          </div>
        )}
        renderConfigureArea={() => (
          <AiModelSelector configs={configs} provider={provider} model={model} disabled={status === 'generating'} onChange={chooseModel} />
        )}
        className="reader-ai-input rss-ai-input"
      />
    </div>
  );
}

export function RssAiPanel(props: {
  item: RssItem;
  selectedText?: string;
  onClearSelectedText?: () => void;
}) {
  return <LearningResourceAiPanel resource={{ type: 'rss', item: props.item }} selectedText={props.selectedText} onClearSelectedText={props.onClearSelectedText} />;
}

export function VideoAiPanel(props: {
  video: VideoResource;
  selectedText?: string;
  onClearSelectedText?: () => void;
}) {
  return <LearningResourceAiPanel resource={{ type: 'video', video: props.video }} selectedText={props.selectedText} onClearSelectedText={props.onClearSelectedText} />;
}

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { AIChatDialogue, AIChatInput, Button, Cascader, Dropdown, Empty, Input, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconAlertTriangle,
  IconArrowLeft,
  IconBookOpenStroked,
  IconBookmark,
  IconColorPalette,
  IconComment,
  IconDeleteStroked,
  IconEditStroked,
  IconHistogram,
  IconHistory,
  IconPlus,
  IconSearch,
} from '@douyinfe/semi-icons';
import { confirmDialog } from '../lib/confirmDialog';
import { createClientId } from '../lib/clientId';
import {
  cancelAiJob,
  getAiJob,
  listAiJobs,
  startAiJob,
  watchAiJob,
  type AiJob,
} from '../lib/aiJobs';
import { getBookPassages } from '../lib/bookSearch';
import { formatRelativeTime } from '../lib/format';
import { markdownNoteExcerpt, markdownNoteTitle } from '../lib/markdownNotes';
import { waitForServerStateWrites } from '../lib/serverStateStorage';
import { useLearningStore } from '../store/useLearningStore';
import type { AiDialogueContentItem, AiProvider, BookItem, ChatSession, HighlightItem, NoteItem, OpenAICompatibleConfig, RightPanel } from '../types';
import { CspSafeChatContent } from './CspSafeChatContent';
import { MarkdownNoteEditor } from './MarkdownNoteEditor';

const { Text } = Typography;

interface ReaderRightPanelProps {
  book: BookItem;
  activePanel: Exclude<RightPanel, null>;
  conversationId: string;
  selectedText?: string;
  getCurrentText: () => string;
  onClearSelectedText: () => void;
  onStartNewConversation: () => void;
  onResumeConversation: (session: ChatSession) => void;
  onJumpHighlight: (highlight: HighlightItem) => void;
  focusedHighlightId?: string | null;
}

interface ReaderActivityBarProps {
  activePanel: RightPanel;
  onChangePanel: (panel: RightPanel) => void;
}

export const panelMeta = {
  ai: { label: 'AI 助手', Icon: IconAIStrokedLevel1 },
  history: { label: '对话历史', Icon: IconHistory },
  notes: { label: '笔记', Icon: IconEditStroked },
  highlights: { label: '高亮', Icon: IconBookmark },
  comments: { label: '评论', Icon: IconComment },
  trajectory: { label: '轨迹', Icon: IconHistogram },
};

export type MobileReaderPanel = Exclude<RightPanel, null> | 'style';

const mobilePanelItems: Array<{
  panel: MobileReaderPanel;
  label: string;
  ariaLabel: string;
  Icon: typeof IconAIStrokedLevel1;
}> = [
  { panel: 'ai', label: 'AI', ariaLabel: '打开 AI 助手', Icon: IconAIStrokedLevel1 },
  { panel: 'history', label: '历史', ariaLabel: '打开对话历史', Icon: IconHistory },
  { panel: 'notes', label: '笔记', ariaLabel: '打开笔记', Icon: IconEditStroked },
  { panel: 'highlights', label: '高亮', ariaLabel: '打开高亮', Icon: IconBookmark },
  { panel: 'comments', label: '评论', ariaLabel: '打开评论', Icon: IconComment },
  { panel: 'trajectory', label: '轨迹', ariaLabel: '打开阅读轨迹', Icon: IconHistogram },
  { panel: 'style', label: '样式', ariaLabel: '打开阅读样式设置', Icon: IconColorPalette },
];

export function ReaderMobilePanelTabs({
  activePanel,
  onChangePanel,
}: {
  activePanel: MobileReaderPanel;
  onChangePanel: (panel: MobileReaderPanel) => void;
}) {
  return (
    <nav className="mobile-panel-tabs" aria-label="切换更多功能">
      {mobilePanelItems.map(({ panel, label, ariaLabel, Icon }) => (
        <Button
          aria-label={ariaLabel}
          aria-pressed={activePanel === panel}
          className={activePanel === panel ? 'mobile-panel-tabs__button--active' : ''}
          icon={<Icon />}
          key={panel}
          size="small"
          theme="borderless"
          type="tertiary"
          onClick={() => onChangePanel(panel)}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}

type AiStatus = 'unavailable' | 'ready' | 'generating' | 'error';

function providerLabel(provider: AiProvider | undefined, configs: OpenAICompatibleConfig[]) {
  if (!provider) return '旧模型';
  return configs.find((config) => provider === `api:${config.id}`)?.name ?? 'API';
}

function activityLabel(panel: Exclude<RightPanel, null>) {
  if (panel === 'ai') return 'AI';
  if (panel === 'history') return '历史';
  return panelMeta[panel].label;
}

function ActivityButton({
  panel,
  activePanel,
  onClick,
}: {
  panel: Exclude<RightPanel, null>;
  activePanel: RightPanel;
  onClick: () => void;
}) {
  const active = panel === activePanel;
  const meta = panelMeta[panel];
  const PanelIcon = meta.Icon;
  const tooltip = panel === 'ai'
    ? active ? '收起 AI 助手' : '打开 AI 助手'
    : active ? `收起${meta.label}` : `打开${meta.label}`;
  const ariaLabel = panel === 'ai'
    ? active ? '收起 AI 助手' : '打开 AI 助手并继续当前对话'
    : active ? `收起${meta.label}` : `打开${meta.label}`;
  return (
    <Tooltip content={tooltip} position="left">
      <Button
        aria-label={ariaLabel}
        aria-pressed={active}
        className={`activity-button${active ? ' activity-button--active' : ''}`}
        contentClassName="activity-button__content"
        icon={<PanelIcon className="panel-tool-icon" />}
        size="small"
        theme="borderless"
        type="tertiary"
        onClick={onClick}
      >
        {activityLabel(panel)}
      </Button>
    </Tooltip>
  );
}

function extractInputText(inputContents?: Array<Record<string, unknown>>) {
  return (inputContents ?? [])
    .map((item) => item.type === 'text' && typeof item.text === 'string' ? item.text : '')
    .join('')
    .trim();
}

function makeConversationTitle(content: string) {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  return (lines.at(-1) || '关于本书的对话').replace(/\s+/g, ' ').slice(0, 32);
}

function formatDuration(durationMs: number) {
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function AiPanel({
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
    () => allChats.filter((message) => message.bookId === book.id && message.conversationId === conversationId),
    [allChats, book.id, conversationId],
  );
  const currentSession = allSessions.find((session) => session.id === conversationId);
  const provider = aiPreferences.provider;
  const selectedConfig = provider
    ? configs.find((config) => provider === `api:${config.id}`)
    : undefined;
  const model = selectedConfig?.models.includes(aiPreferences.model)
    ? aiPreferences.model
    : selectedConfig?.models[0] ?? '';
  const modelTreeData = useMemo(() => configs.map((config) => ({
    label: config.name,
    value: `api:${config.id}`,
    children: config.models.map((item) => ({ label: item, value: item })),
  })), [configs]);
  const [status, setStatus] = useState<AiStatus>(() => selectedConfig && model ? 'ready' : 'unavailable');
  const [statusMessage, setStatusMessage] = useState('');
  const [quote, setQuote] = useState<{ text: string; chapter: string } | null>(null);
  const [streamingAssistant, setStreamingAssistant] = useState<{
    id: string;
    role: 'assistant';
    content: AiDialogueContentItem[];
    status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    createdAt: number;
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof AIChatInput>>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

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
  }, [conversationId]);

  const applyJob = useCallback((job: AiJob) => {
    if (job.status === 'queued' || job.status === 'running') {
      setActiveJobId(job.id);
      setStreamingAssistant({
        id: job.assistantMessageId,
        role: 'assistant',
        content: job.dialogueContent,
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
      content: job.dialogueContent,
      status: 'failed',
      createdAt: job.createdAt,
    });
    setStatus('error');
    setStatusMessage(job.error || '模型请求失败');
  }, []);

  useEffect(() => {
    let disposed = false;
    void listAiJobs(book.id, conversationId).then((jobs) => {
      if (disposed) return;
      const runningJob = jobs.find((job) => job.status === 'queued' || job.status === 'running');
      if (runningJob) applyJob(runningJob);
    }).catch((error) => {
      if (!disposed) setStatusMessage(error instanceof Error ? error.message : '无法读取服务端任务');
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
          timer = window.setTimeout(poll, 250);
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
    void watchAiJob(activeJobId, (job) => {
      if (!disposed) applyStreamedJob(job);
    }, controller.signal).catch((error) => {
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
    if (currentSession) updateChatSession(currentSession.id, { provider: nextProvider, model: nextModel });
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
    const userMessageId = createClientId();
    addChatMessage({
      id: userMessageId,
      bookId: book.id,
      conversationId,
      role: 'user',
      content: question,
      ...(quoteForMessage ? { quote: quoteForMessage } : {}),
      createdAt,
    });
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
      setStreamingAssistant((message) => message ? { ...message, status: 'failed' } : null);
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '请求失败');
    }
  };

  const stop = () => {
    if (!activeJobId) return;
    void cancelAiJob(activeJobId).then(applyJob).catch((error) => {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '停止任务失败');
    });
  };

  const dialogueMessages = [
    ...chats.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.dialogueContent?.length ? message.dialogueContent : message.content,
      createdAt: message.createdAt,
      status: 'completed',
    })),
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
    const target = list?.querySelectorAll<HTMLElement>('.semi-ai-chat-dialogue-wrapper').item(messageIndex);
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
              const preview = typeof message.content === 'string'
                ? message.content.replace(/\s+/g, ' ').trim()
                : `第 ${turnIndex + 1} 轮用户消息`;
              const tooltip = preview.length > 160 ? `${preview.slice(0, 160)}…` : preview;
              return (
                <Tooltip
                  key={message.id}
                  content={<span className="chat-turn-nav__preview">{tooltip || `第 ${turnIndex + 1} 轮用户消息`}</span>}
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
        {dialogueMessages.length ? (
          <AIChatDialogue
            chats={dialogueMessages}
            align="leftRight"
            mode="bubble"
            roleConfig={{ user: { name: '你' }, assistant: { name: providerLabel(provider ?? undefined, configs) } }}
            dialogueRenderConfig={{
              renderDialogueAvatar: () => null,
              renderDialogueTitle: () => null,
              renderDialogueAction: () => null,
              renderDialogueContent: ({ message, className }) => (
                <CspSafeChatContent message={message} bubbleClassName={className} />
              ),
            }}
          />
        ) : <Empty title="开始新的对话" description="Agent 会按需检索整本书、学习记录与联网资料" />}
      </div>

      <AIChatInput
        ref={inputRef}
        references={quote ? [{
          id: 'reader-selection',
          type: 'text',
          content: `书中引用 · ${quote.chapter}：${quote.text}`,
        }] : []}
        showReference
        onReferenceDelete={() => setQuote(null)}
        keepSkillAfterSend={false}
        placeholder={canSend ? '输入关于本书的问题…' : '添加并选择模型后开始提问'}
        canSend={canSend}
        generating={status === 'generating'}
        onMessageSend={({ inputContents }) => void send(extractInputText(inputContents as Array<Record<string, unknown>>))}
        onStopGenerate={stop}
        showUploadButton={false}
        showTemplateButton={false}
        round
        renderTopSlot={() => (
          <div className="ai-composer-context">
            <div className="ai-composer-context__row">
              <Tooltip content="Agent 可按需读取章节、搜索整本书，并在已配置时联网检索" position="topLeft">
                <div className="ai-book-context" aria-label={`当前书籍《${book.title}》，已自动提供阅读工具`}>
                  <IconBookOpenStroked size="small" />
                  <Text size="small" ellipsis={{ showTooltip: true }}>《{book.title}》 · {book.currentChapter || '当前章节'}</Text>
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
          <Cascader
            aria-label="选择 AI 供应商和模型"
            size="small"
            treeData={modelTreeData}
            value={provider && model ? [provider, model] : []}
            placeholder="选择供应商 / 模型"
            disabled={status === 'generating'}
            showNext="hover"
            changeOnSelect={false}
            displayRender={(labels) => Array.isArray(labels) ? labels.at(-1) ?? '' : ''}
            onChange={chooseModel}
            className="ai-composer-model-cascader"
          />
        )}
        className="reader-ai-input"
      />
    </div>
  );
}

function HistoryPanel({
  bookId,
  activeConversationId,
  onResumeConversation,
}: {
  bookId: string;
  activeConversationId: string;
  onResumeConversation: (session: ChatSession) => void;
}) {
  const allChats = useLearningStore((state) => state.chats);
  const allSessions = useLearningStore((state) => state.chatSessions);
  const configs = useLearningStore((state) => state.openAIConfigs);
  const deleteChatSession = useLearningStore((state) => state.deleteChatSession);
  const [contextMenu, setContextMenu] = useState<{
    session: ChatSession;
    x: number;
    y: number;
  } | null>(null);
  const sessions = useMemo(
    () => allSessions.filter((session) => session.bookId === bookId).sort((left, right) => right.updatedAt - left.updatedAt),
    [allSessions, bookId],
  );

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const confirmDelete = (session: ChatSession) => {
    confirmDialog({
      title: `删除“${session.title}”？`,
      content: '这条对话及其中的消息只会从服务器数据目录删除，且无法恢复。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-danger)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        deleteChatSession(session.id);
        Toast.success('对话已删除');
      },
    });
  };

  return (
    <div className="right-panel__body history-panel">
      {sessions.length ? sessions.map((session) => {
        const messageCount = allChats.filter((message) => message.conversationId === session.id).length;
        const modelLabel = session.model || providerLabel(session.provider, configs);
        const metaLabel = `${formatRelativeTime(session.updatedAt)} · ${modelLabel} · ${messageCount} 条消息`;
        return (
          <button
            key={session.id}
            type="button"
            title="右键可删除这条对话"
            className={`ai-history-item${session.id === activeConversationId ? ' ai-history-item--active' : ''}`}
            onClick={() => onResumeConversation(session)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({ session, x: event.clientX, y: event.clientY });
            }}
          >
            <span className="ai-history-item__title">
              <strong>{session.title}</strong>
            </span>
            <span className="ai-history-item__meta" title={metaLabel}>{metaLabel}</span>
          </button>
        );
      }) : <Empty title="暂无历史对话" description="发送第一条消息后会自动保存到服务器" />}
      {contextMenu && createPortal((
        <Dropdown
          autoAdjustOverflow
          closeOnEsc
          margin={0}
          motion={false}
          position="bottomLeft"
          rePosKey={`${contextMenu.x}:${contextMenu.y}`}
          spacing={0}
          trigger="custom"
          visible
          render={(
            <Dropdown.Menu>
              <Dropdown.Item
                type="danger"
                icon={<IconDeleteStroked />}
                onClick={() => {
                  const { session } = contextMenu;
                  setContextMenu(null);
                  confirmDelete(session);
                }}
              >
                删除对话
              </Dropdown.Item>
            </Dropdown.Menu>
          )}
          onVisibleChange={(visible) => {
            if (!visible) setContextMenu(null);
          }}
        >
          <span
            aria-hidden="true"
            className="cursor-context-menu-anchor"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            tabIndex={-1}
          />
        </Dropdown>
      ), document.body)}
    </div>
  );
}

function NotesPanel({
  bookId,
  selectedNoteId,
  onSelectNote,
  onBack,
}: {
  bookId: string;
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onBack: () => void;
}) {
  const allNotes = useLearningStore((state) => state.notes);
  const addNote = useLearningStore((state) => state.addNote);
  const updateNote = useLearningStore((state) => state.updateNote);
  const deleteNote = useLearningStore((state) => state.deleteNote);
  const [query, setQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    note: NoteItem;
    x: number;
    y: number;
  } | null>(null);
  const notes = useMemo(
    () => allNotes.filter((note) => note.bookId === bookId).sort((left, right) => right.updatedAt - left.updatedAt),
    [allNotes, bookId],
  );
  const selectedNote = notes.find((note) => note.id === selectedNoteId);
  const filteredNotes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return notes;
    return notes.filter((note) => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(normalized));
  }, [notes, query]);

  useEffect(() => {
    if (selectedNoteId && !selectedNote) onBack();
  }, [onBack, selectedNote, selectedNoteId]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const createNote = () => {
    const timestamp = Date.now();
    const id = createClientId();
    addNote({
      id,
      bookId,
      title: '未命名笔记',
      content: '',
      fileName: `note-${timestamp}.md`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    onSelectNote(id);
  };

  const confirmDelete = (note: NoteItem) => {
    confirmDialog({
      title: `删除“${note.title || '未命名笔记'}”？`,
      content: '只会删除保存在服务器数据目录中的这篇笔记。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        deleteNote(note.id);
        Toast.success('笔记已删除');
      },
    });
  };

  if (selectedNote) {
    return (
      <div className="right-panel__body notes-panel notes-panel--detail">
        <div className="markdown-note-editor">
          <MarkdownNoteEditor
            key={selectedNote.id}
            ariaLabel={`编辑“${selectedNote.title || '未命名笔记'}”的 Markdown 内容`}
            content={selectedNote.content}
            onChange={(content) => updateNote(selectedNote.id, { content })}
          />
          <div className="markdown-note-editor__footer">
            <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
              {selectedNote.fileName || '应用内 Markdown 笔记'}
            </Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="right-panel__body notes-panel notes-panel--list">
      <div className="notes-list-toolbar">
        <Input
          aria-label="搜索笔记标题和内容"
          prefix={<IconSearch />}
          placeholder="搜索笔记"
          showClear
          value={query}
          onChange={setQuery}
          className="notes-search-input"
        />
        <div className="notes-list-actions">
          <Tooltip content="新建笔记">
            <Button
              aria-label="新建 Markdown 笔记"
              icon={<IconPlus />}
              theme="borderless"
              type="tertiary"
              onClick={createNote}
            />
          </Tooltip>
        </div>
      </div>
      <div className="notes-list" aria-label="笔记列表">
        {filteredNotes.length ? filteredNotes.map((note) => (
          <button
            className="note-list-item"
            key={note.id}
            title="右键可删除这篇笔记"
            type="button"
            onClick={() => onSelectNote(note.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({ note, x: event.clientX, y: event.clientY });
            }}
          >
            <strong>{note.title || markdownNoteTitle(note.content)}</strong>
            <span className="note-list-item__excerpt">{markdownNoteExcerpt(note.content) || '空白笔记'}</span>
            <span className="note-list-item__meta">
              {note.fileName || '应用内笔记'} · {formatRelativeTime(note.updatedAt)}
            </span>
          </button>
        )) : (
          <Empty
            title={notes.length ? '没有找到匹配的笔记' : '还没有笔记'}
            description={notes.length ? '试试搜索其他标题或内容' : '新建一篇笔记开始记录'}
          />
        )}
      </div>
      {contextMenu && createPortal((
        <Dropdown
          autoAdjustOverflow
          closeOnEsc
          margin={0}
          motion={false}
          position="bottomLeft"
          rePosKey={`${contextMenu.x}:${contextMenu.y}`}
          spacing={0}
          trigger="custom"
          visible
          render={(
            <Dropdown.Menu>
              <Dropdown.Item
                type="danger"
                icon={<IconDeleteStroked />}
                onClick={() => {
                  const { note } = contextMenu;
                  setContextMenu(null);
                  confirmDelete(note);
                }}
              >
                删除笔记
              </Dropdown.Item>
            </Dropdown.Menu>
          )}
          onVisibleChange={(visible) => {
            if (!visible) setContextMenu(null);
          }}
        >
          <span
            aria-hidden="true"
            className="cursor-context-menu-anchor"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            tabIndex={-1}
          />
        </Dropdown>
      ), document.body)}
    </div>
  );
}

function NoteTitleInput({
  note,
  onChange,
}: {
  note: NoteItem;
  onChange: (title: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title.trim() || '未命名笔记');

  useEffect(() => {
    if (!editing) setDraft(note.title.trim() || '未命名笔记');
  }, [editing, note.title]);

  const beginEditing = () => {
    if (editing) return;
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commit = () => {
    const nextTitle = draft.trim() || '未命名笔记';
    setDraft(nextTitle);
    setEditing(false);
    if (nextTitle !== note.title) onChange(nextTitle);
  };

  const cancel = () => {
    setDraft(note.title.trim() || '未命名笔记');
    setEditing(false);
  };

  return (
    <input
      ref={inputRef}
      aria-label="笔记名称，双击编辑"
      className={`note-title-input${editing ? ' note-title-input--editing' : ''}`}
      readOnly={!editing}
      title={editing ? undefined : '双击编辑笔记名称'}
      value={draft}
      onBlur={() => {
        if (editing) commit();
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onDoubleClick={beginEditing}
      onKeyDown={(event) => {
        if (!editing && (event.key === 'Enter' || event.key === 'F2')) {
          event.preventDefault();
          beginEditing();
          return;
        }
        if (editing && event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (editing && event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
}

function HighlightsPanel({
  bookId,
  focusedHighlightId,
  onJumpHighlight,
}: {
  bookId: string;
  focusedHighlightId?: string | null;
  onJumpHighlight: (highlight: HighlightItem) => void;
}) {
  const allHighlights = useLearningStore((state) => state.highlights);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const highlights = useMemo(
    () => allHighlights.filter((highlight) => highlight.bookId === bookId && highlight.kind !== 'comment'),
    [allHighlights, bookId],
  );
  const focusedCardRef = useRef<HTMLElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    highlight: HighlightItem;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!focusedHighlightId) return;
    focusedCardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedHighlightId, highlights]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  return (
    <div className="right-panel__body highlights-panel">
      {highlights.length ? highlights.map((highlight) => (
        <article
          className={`highlight-card${highlight.id === focusedHighlightId ? ' highlight-card--focused' : ''}`}
          key={highlight.id}
          ref={highlight.id === focusedHighlightId ? focusedCardRef : undefined}
          role="button"
          tabIndex={0}
          title="右键可删除高亮"
          onClick={() => onJumpHighlight(highlight)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenu({ highlight, x: event.clientX, y: event.clientY });
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onJumpHighlight(highlight);
            }
          }}
        >
          <p>{highlight.text}</p>
          <div className="highlight-card__footer">
            <Text size="small" type="tertiary">{highlight.chapter}{highlight.page ? ` · 第 ${highlight.page} 页` : ''}</Text>
          </div>
        </article>
      )) : <Empty title="还没有高亮" description="选中阅读器中的文字即可添加高亮" />}
      {contextMenu && createPortal((
        <Dropdown
          autoAdjustOverflow
          closeOnEsc
          margin={0}
          motion={false}
          position="bottomLeft"
          rePosKey={`${contextMenu.x}:${contextMenu.y}`}
          spacing={0}
          trigger="custom"
          visible
          render={(
            <Dropdown.Menu>
              <Dropdown.Item
                type="danger"
                icon={<IconDeleteStroked />}
                onClick={() => {
                  const { highlight } = contextMenu;
                  setContextMenu(null);
                  deleteHighlight(highlight.id);
                }}
              >
                删除高亮
              </Dropdown.Item>
            </Dropdown.Menu>
          )}
          onVisibleChange={(visible) => {
            if (!visible) setContextMenu(null);
          }}
        >
          <span
            aria-hidden="true"
            className="cursor-context-menu-anchor"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            tabIndex={-1}
          />
        </Dropdown>
      ), document.body)}
    </div>
  );
}

function CommentsPanel({ bookId, onJumpHighlight }: { bookId: string; onJumpHighlight: (highlight: HighlightItem) => void }) {
  const allHighlights = useLearningStore((state) => state.highlights);
  const updateHighlight = useLearningStore((state) => state.updateHighlight);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const comments = useMemo(
    () => allHighlights
      .filter((highlight) => highlight.bookId === bookId && highlight.comment?.trim())
      .sort((left, right) => (right.commentUpdatedAt ?? right.createdAt) - (left.commentUpdatedAt ?? left.createdAt)),
    [allHighlights, bookId],
  );
  const [contextMenu, setContextMenu] = useState<{
    highlight: HighlightItem;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const confirmDeleteComment = (highlight: HighlightItem) => {
    confirmDialog({
      title: '删除这条评论？',
      content: highlight.kind === 'comment'
        ? '只会删除保存在服务器数据目录中的评论和对应正文标记。'
        : '只会删除保存在服务器数据目录中的评论，正文高亮仍会保留。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        if (highlight.kind === 'comment') deleteHighlight(highlight.id);
        else updateHighlight(highlight.id, { comment: '' });
        Toast.success('评论已删除');
      },
    });
  };

  return (
    <div className="right-panel__body comments-panel">
      {comments.length ? comments.map((highlight) => (
        <article
          className="comment-card"
          key={highlight.id}
          role="button"
          tabIndex={0}
          title="右键可删除评论"
          onClick={() => onJumpHighlight(highlight)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenu({ highlight, x: event.clientX, y: event.clientY });
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onJumpHighlight(highlight);
            }
          }}
        >
          <blockquote>{highlight.text}</blockquote>
          <p>{highlight.comment}</p>
          <div className="comment-card__footer">
            <Text size="small" type="tertiary">
              {highlight.chapter}{highlight.page ? ` · 第 ${highlight.page} 页` : ''}
            </Text>
            <Text size="small" type="tertiary">
              {formatRelativeTime(highlight.commentUpdatedAt ?? highlight.createdAt)}
            </Text>
          </div>
        </article>
      )) : <Empty title="还没有评论" description="点击正文中的高亮，即可写下自己的见解" />}
      {contextMenu && createPortal((
        <Dropdown
          autoAdjustOverflow
          closeOnEsc
          margin={0}
          motion={false}
          position="bottomLeft"
          rePosKey={`${contextMenu.x}:${contextMenu.y}`}
          spacing={0}
          trigger="custom"
          visible
          render={(
            <Dropdown.Menu>
              <Dropdown.Item
                type="danger"
                icon={<IconDeleteStroked />}
                onClick={() => {
                  const { highlight } = contextMenu;
                  setContextMenu(null);
                  confirmDeleteComment(highlight);
                }}
              >
                删除评论
              </Dropdown.Item>
            </Dropdown.Menu>
          )}
          onVisibleChange={(visible) => {
            if (!visible) setContextMenu(null);
          }}
        >
          <span
            aria-hidden="true"
            className="cursor-context-menu-anchor"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            tabIndex={-1}
          />
        </Dropdown>
      ), document.body)}
    </div>
  );
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function TrajectoryPanel({ bookId }: { bookId: string }) {
  const allSessions = useLearningStore((state) => state.readingSessions);
  const sessions = useMemo(
    () => allSessions.filter((session) => session.bookId === bookId && session.durationMs > 0).sort((a, b) => b.startedAt - a.startedAt),
    [allSessions, bookId],
  );
  const dailyHistory = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      startedAt: number;
      endedAt: number;
      durationMs: number;
      sessionCount: number;
    }>();
    sessions.forEach((session) => {
      const key = dateKey(session.startedAt);
      const current = groups.get(key);
      groups.set(key, current
        ? {
          ...current,
          startedAt: Math.min(current.startedAt, session.startedAt),
          endedAt: Math.max(current.endedAt, session.endedAt),
          durationMs: current.durationMs + session.durationMs,
          sessionCount: current.sessionCount + 1,
        }
        : {
          key,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationMs: session.durationMs,
          sessionCount: 1,
        });
    });
    return Array.from(groups.values()).sort((left, right) => right.startedAt - left.startedAt);
  }, [sessions]);
  const total = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const heatmap = useMemo(() => {
    const totals = new Map(dailyHistory.map((day) => [day.key, day.durationMs]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (83 - index));
      const durationMs = totals.get(dateKey(date.getTime())) ?? 0;
      const minutes = durationMs / 60_000;
      const level = minutes === 0 ? 0 : minutes < 15 ? 1 : minutes < 30 ? 2 : minutes < 60 ? 3 : 4;
      return { key: dateKey(date.getTime()), date, durationMs, level };
    });
  }, [dailyHistory]);

  return (
    <div className="right-panel__body trajectory-panel">
      <section className="trajectory-section">
        <div className="trajectory-section__heading">
          <Text strong>最近 12 周</Text>
          <Text size="small" type="tertiary">阅读热力图</Text>
        </div>
        <div className="reading-heatmap" aria-label="最近 12 周阅读热力图">
          {heatmap.map((day) => (
            <Tooltip key={day.key} content={`${day.date.toLocaleDateString('zh-CN')} · ${formatDuration(day.durationMs)}`}>
              <span className={`reading-heatmap__cell reading-heatmap__cell--${day.level}`} aria-label={`${day.key} ${formatDuration(day.durationMs)}`} />
            </Tooltip>
          ))}
        </div>
        <div className="heatmap-legend" aria-hidden="true"><span>少</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`reading-heatmap__cell reading-heatmap__cell--${level}`} />)}<span>多</span></div>
      </section>

      <section className="reading-total-card">
        <Text size="small" type="tertiary">累计阅读时间</Text>
        <strong>{formatDuration(total)}</strong>
        <Text size="small" type="tertiary">共阅读 {dailyHistory.length} 天 · {sessions.length} 次</Text>
      </section>

      <section className="trajectory-section trajectory-history">
        <div className="trajectory-section__heading"><Text strong>阅读历史</Text></div>
        {dailyHistory.length ? dailyHistory.slice(0, 30).map((day) => (
          <div className="reading-history-item" key={day.key}>
            <span>
              <Text>{new Date(day.startedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</Text>
              <Text size="small" type="tertiary">
                {new Date(day.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                {'–'}
                {new Date(day.endedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                {' · '}{day.sessionCount} 次
              </Text>
            </span>
            <Text strong>{formatDuration(day.durationMs)}</Text>
          </div>
        )) : <Empty title="还没有阅读轨迹" description="打开书籍并开始阅读后会自动记录" />}
      </section>
    </div>
  );
}

export function ReaderRightPanel({
  book,
  activePanel,
  conversationId,
  selectedText,
  getCurrentText,
  onClearSelectedText,
  onStartNewConversation,
  onResumeConversation,
  onJumpHighlight,
  focusedHighlightId,
}: ReaderRightPanelProps) {
  const ActivePanelIcon = panelMeta[activePanel].Icon;
  const allNotes = useLearningStore((state) => state.notes);
  const updateNote = useLearningStore((state) => state.updateNote);
  const deleteNote = useLearningStore((state) => state.deleteNote);
  const hasCurrentConversation = useLearningStore((state) => (
    state.chatSessions.some((session) => session.id === conversationId)
    || state.chats.some((message) => message.conversationId === conversationId)
  ));
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedNoteId(null);
  }, [book.id]);

  useEffect(() => {
    if (activePanel !== 'notes') setSelectedNoteId(null);
  }, [activePanel]);

  const selectedNote = activePanel === 'notes'
    ? allNotes.find((note) => note.id === selectedNoteId && note.bookId === book.id)
    : undefined;
  const isNoteDetail = selectedNote !== undefined;

  const confirmDeleteNote = () => {
    if (!selectedNote) return;
    confirmDialog({
      title: `删除“${selectedNote.title || '未命名笔记'}”？`,
      content: '只会删除保存在服务器数据目录中的这篇笔记。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        deleteNote(selectedNote.id);
        setSelectedNoteId(null);
      },
    });
  };

  return (
    <aside className={`right-panel${activePanel === 'ai' ? ' right-panel--ai' : ''}`} aria-label={panelMeta[activePanel].label}>
      <div className={`panel-titlebar${isNoteDetail ? ' panel-titlebar--note-detail' : ''}`}>
        <div className="panel-titlebar__title">
          {isNoteDetail ? (
            <Tooltip content="返回笔记列表">
              <Button
                aria-label="返回笔记列表"
                className="panel-titlebar__back"
                icon={<IconArrowLeft />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => setSelectedNoteId(null)}
              />
            </Tooltip>
          ) : <ActivePanelIcon size="large" className="panel-tool-icon" />}
          <Text strong>{isNoteDetail ? '编辑笔记' : panelMeta[activePanel].label}</Text>
          {selectedNote ? (
            <NoteTitleInput
              note={selectedNote}
              onChange={(title) => updateNote(selectedNote.id, { title })}
            />
          ) : null}
        </div>
        {activePanel === 'ai' && hasCurrentConversation ? (
          <Button
            aria-label="新建 AI 对话"
            className="panel-titlebar__new-chat"
            icon={<IconPlus />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={onStartNewConversation}
          >
            新建对话
          </Button>
        ) : selectedNote ? (
          <Tooltip content="删除笔记">
            <Button
              aria-label={`删除笔记 ${selectedNote.title || '未命名笔记'}`}
              className="panel-titlebar__delete"
              icon={<IconDeleteStroked />}
              size="small"
              theme="borderless"
              type="danger"
              onClick={confirmDeleteNote}
            />
          </Tooltip>
        ) : null}
      </div>
      {activePanel === 'ai' && (
        <AiPanel
          book={book}
          conversationId={conversationId}
          selectedText={selectedText}
          getCurrentText={getCurrentText}
          onClearSelectedText={onClearSelectedText}
        />
      )}
      {activePanel === 'history' && (
        <HistoryPanel bookId={book.id} activeConversationId={conversationId} onResumeConversation={onResumeConversation} />
      )}
      {activePanel === 'notes' && (
        <NotesPanel
          bookId={book.id}
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          onBack={() => setSelectedNoteId(null)}
        />
      )}
      {activePanel === 'highlights' && (
        <HighlightsPanel
          bookId={book.id}
          focusedHighlightId={focusedHighlightId}
          onJumpHighlight={onJumpHighlight}
        />
      )}
      {activePanel === 'comments' && <CommentsPanel bookId={book.id} onJumpHighlight={onJumpHighlight} />}
      {activePanel === 'trajectory' && <TrajectoryPanel bookId={book.id} />}
    </aside>
  );
}

export function ReaderActivityBar({ activePanel, onChangePanel }: ReaderActivityBarProps) {
  const toggle = (panel: Exclude<RightPanel, null>) => onChangePanel(activePanel === panel ? null : panel);
  return (
    <nav className="activity-bar" aria-label="阅读辅助工具">
      <ActivityButton panel="ai" activePanel={activePanel} onClick={() => toggle('ai')} />
      <ActivityButton panel="history" activePanel={activePanel} onClick={() => toggle('history')} />
      <ActivityButton panel="comments" activePanel={activePanel} onClick={() => toggle('comments')} />
      <ActivityButton panel="highlights" activePanel={activePanel} onClick={() => toggle('highlights')} />
      <ActivityButton panel="trajectory" activePanel={activePanel} onClick={() => toggle('trajectory')} />
    </nav>
  );
}

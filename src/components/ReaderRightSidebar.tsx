import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { AIChatDialogue, AIChatInput, Button, Cascader, Dropdown, Empty, Modal, TextArea, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconAlertTriangle,
  IconBookOpenStroked,
  IconBookmark,
  IconDeleteStroked,
  IconEditStroked,
  IconHistogram,
  IconHistory,
  IconPlus,
} from '@douyinfe/semi-icons';
import { formatRelativeTime } from '../lib/format';
import { runOpenAICompatibleChat, type OpenAICompatibleChatProgress } from '../lib/openAICompatibleClient';
import { useLearningStore } from '../store/useLearningStore';
import type { AiDialogueContentItem, AiProvider, BookItem, ChatSession, HighlightItem, OpenAICompatibleConfig, RightPanel } from '../types';

const { Text } = Typography;

interface ReaderRightPanelProps {
  book: BookItem;
  activePanel: Exclude<RightPanel, null>;
  conversationId: string;
  selectedText?: string;
  getCurrentText: () => string;
  onClearSelectedText: () => void;
  onResumeConversation: (session: ChatSession) => void;
  onJumpHighlight: (highlight: HighlightItem) => void;
}

interface ReaderActivityBarProps {
  activePanel: RightPanel;
  onChangePanel: (panel: RightPanel) => void;
  onStartNewConversation: () => void;
}

export const panelMeta = {
  ai: { label: 'AI 助手', Icon: IconAIStrokedLevel1 },
  history: { label: '对话历史', Icon: IconHistory },
  notes: { label: '笔记', Icon: IconEditStroked },
  highlights: { label: '划线', Icon: IconBookmark },
  trajectory: { label: '轨迹', Icon: IconHistogram },
};

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
    ? active ? '收起 AI 助手' : '新对话'
    : active ? `收起${meta.label}` : `打开${meta.label}`;
  const ariaLabel = panel === 'ai'
    ? active ? '收起 AI 助手' : '开始新的 AI 对话'
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
  const allNotes = useLearningStore((state) => state.notes);
  const allHighlights = useLearningStore((state) => state.highlights);
  const allReadingSessions = useLearningStore((state) => state.readingSessions);
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
  const notes = useMemo(() => allNotes.filter((note) => note.bookId === book.id), [allNotes, book.id]);
  const highlights = useMemo(() => allHighlights.filter((item) => item.bookId === book.id), [allHighlights, book.id]);
  const readingSessions = useMemo(
    () => allReadingSessions.filter((item) => item.bookId === book.id).sort((a, b) => b.startedAt - a.startedAt),
    [allReadingSessions, book.id],
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
    status: OpenAICompatibleChatProgress['status'] | 'failed';
    createdAt: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<ComponentRef<typeof AIChatInput>>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setStatusMessage('');
    if (!provider && configs[0]) {
      setAiPreferences({ provider: `api:${configs[0].id}`, model: configs[0].models[0] ?? '' });
      return;
    }
    setStatus(selectedConfig && model ? 'ready' : 'unavailable');
    if (selectedConfig && model !== aiPreferences.model) setAiPreferences({ model });
  }, [aiPreferences.model, configs, model, provider, selectedConfig, setAiPreferences]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    setQuote(null);
    setStreamingAssistant(null);
  }, [conversationId]);

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
    abortRef.current?.abort();
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
    addChatMessage({
      id: crypto.randomUUID(),
      bookId: book.id,
      conversationId,
      role: 'user',
      content: question,
      ...(quoteForMessage ? { quote: quoteForMessage } : {}),
      createdAt,
    });
    setQuote(null);

    if (!selectedConfig || !model) return;
    const controller = new AbortController();
    const assistantMessageId = crypto.randomUUID();
    const assistantCreatedAt = Date.now();
    abortRef.current = controller;
    setStreamingAssistant({
      id: assistantMessageId,
      role: 'assistant',
      content: [],
      status: 'in_progress',
      createdAt: assistantCreatedAt,
    });
    setStatus('generating');
    setStatusMessage('');
    try {
      const answer = await runOpenAICompatibleChat({
        config: selectedConfig,
        model,
        messages: [
          ...chats.map(({ role, content: messageContent, quote: messageQuote }) => ({
            role,
            content: messageContent,
            ...(messageQuote ? { quote: messageQuote } : {}),
          })),
          { role: 'user', content: question, ...(quoteForMessage ? { quote: quoteForMessage } : {}) },
        ],
        book,
        currentText: getCurrentText(),
        notes,
        highlights,
        readingSessions,
        signal: controller.signal,
        onProgress: (progress) => {
          if (abortRef.current !== controller) return;
          setStreamingAssistant({
            id: assistantMessageId,
            role: 'assistant',
            content: progress.dialogueContent,
            status: progress.status,
            createdAt: assistantCreatedAt,
          });
        },
      });
      addChatMessage({
        id: assistantMessageId,
        bookId: book.id,
        conversationId,
        role: 'assistant',
        content: answer.content,
        dialogueContent: answer.dialogueContent,
        createdAt: assistantCreatedAt,
      });
      setStreamingAssistant(null);
      setStatus('ready');
      setStatusMessage('');
    } catch (error) {
      if (controller.signal.aborted) {
        setStreamingAssistant(null);
        setStatus('ready');
        setStatusMessage('已停止生成');
      } else {
        setStreamingAssistant((message) => message ? { ...message, status: 'failed' } : null);
        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : '请求失败');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const dialogueMessages = [
    ...chats.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.dialogueContent?.length ? message.dialogueContent : message.content,
      createdAt: message.createdAt,
      status: 'completed',
    })),
    ...(streamingAssistant ? [streamingAssistant] : []),
  ];
  const canSend = status === 'ready' || status === 'error';

  return (
    <div className="right-panel__body ai-panel">
      <div className="semi-chat-area" aria-live="polite">
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
            }}
          />
        ) : <Empty title="开始新的对话" description="Agent 会按需读取当前书籍、章节、笔记、划线和阅读轨迹" />}
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
              <Tooltip content="Agent 可按需读取当前书籍、章节、笔记、划线和阅读轨迹" position="topLeft">
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
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const confirmDelete = (session: ChatSession) => {
    Modal.confirm({
      title: `删除“${session.title}”？`,
      content: '这条对话及其中的消息只会从此设备删除，且无法恢复。',
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
      }) : <Empty title="暂无历史对话" description="发送第一条消息后会自动保存在此设备" />}
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

function NotesPanel({ bookId }: { bookId: string }) {
  const allNotes = useLearningStore((state) => state.notes);
  const addNote = useLearningStore((state) => state.addNote);
  const updateNote = useLearningStore((state) => state.updateNote);
  const deleteNote = useLearningStore((state) => state.deleteNote);
  const notes = useMemo(() => allNotes.filter((note) => note.bookId === bookId), [allNotes, bookId]);
  const createNote = () => {
    const timestamp = Date.now();
    addNote({ id: crypto.randomUUID(), bookId, content: '', createdAt: timestamp, updatedAt: timestamp });
  };
  return (
    <div className="right-panel__body notes-panel">
      <Tooltip content="新建笔记">
        <Button aria-label="新建笔记" className="panel-mini-action" theme="light" icon={<IconPlus />} size="small" onClick={createNote} />
      </Tooltip>
      {notes.length ? notes.map((note) => (
        <article className="note-card" key={note.id}>
          <TextArea
            aria-label="笔记内容"
            autosize={{ minRows: 4, maxRows: 10 }}
            placeholder="记录此刻的想法…"
            value={note.content}
            onChange={(content) => updateNote(note.id, content)}
          />
          <div className="note-card__footer note-card__footer--end">
            <Tooltip content="删除笔记">
              <Button aria-label="删除笔记" icon={<IconDeleteStroked />} size="small" theme="borderless" type="danger" onClick={() => deleteNote(note.id)} />
            </Tooltip>
          </div>
        </article>
      )) : <Empty title="还没有笔记" description="阅读时记下问题、理解和联想" />}
    </div>
  );
}

function HighlightsPanel({ bookId, onJumpHighlight }: { bookId: string; onJumpHighlight: (highlight: HighlightItem) => void }) {
  const allHighlights = useLearningStore((state) => state.highlights);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const highlights = useMemo(() => allHighlights.filter((highlight) => highlight.bookId === bookId), [allHighlights, bookId]);
  return (
    <div className="right-panel__body highlights-panel">
      {highlights.length ? highlights.map((highlight) => (
        <article
          className="highlight-card"
          key={highlight.id}
          role="button"
          tabIndex={0}
          onClick={() => onJumpHighlight(highlight)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onJumpHighlight(highlight);
            }
          }}
        >
          <p>{highlight.text}</p>
          <div className="highlight-card__footer">
            <Text size="small" type="tertiary">{highlight.chapter}{highlight.page ? ` · 第 ${highlight.page} 页` : ''}</Text>
            <Tooltip content="删除划线">
              <Button
                aria-label="删除划线"
                icon={<IconDeleteStroked />}
                size="small"
                theme="borderless"
                type="danger"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteHighlight(highlight.id);
                }}
              />
            </Tooltip>
          </div>
        </article>
      )) : <Empty title="还没有划线" description="选中阅读器中的文字即可高亮收藏" />}
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
  onResumeConversation,
  onJumpHighlight,
}: ReaderRightPanelProps) {
  const ActivePanelIcon = panelMeta[activePanel].Icon;
  return (
    <aside className={`right-panel${activePanel === 'ai' ? ' right-panel--ai' : ''}`} aria-label={panelMeta[activePanel].label}>
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
          <ActivePanelIcon size="large" className="panel-tool-icon" />
          <Text strong>{panelMeta[activePanel].label}</Text>
        </div>
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
      {activePanel === 'notes' && <NotesPanel bookId={book.id} />}
      {activePanel === 'highlights' && <HighlightsPanel bookId={book.id} onJumpHighlight={onJumpHighlight} />}
      {activePanel === 'trajectory' && <TrajectoryPanel bookId={book.id} />}
    </aside>
  );
}

export function ReaderActivityBar({ activePanel, onChangePanel, onStartNewConversation }: ReaderActivityBarProps) {
  const toggle = (panel: Exclude<RightPanel, null>) => onChangePanel(activePanel === panel ? null : panel);
  const toggleAi = () => {
    if (activePanel === 'ai') {
      onChangePanel(null);
      return;
    }
    onStartNewConversation();
  };
  return (
    <nav className="activity-bar" aria-label="阅读辅助工具">
      <ActivityButton panel="ai" activePanel={activePanel} onClick={toggleAi} />
      <ActivityButton panel="history" activePanel={activePanel} onClick={() => toggle('history')} />
      <ActivityButton panel="notes" activePanel={activePanel} onClick={() => toggle('notes')} />
      <ActivityButton panel="highlights" activePanel={activePanel} onClick={() => toggle('highlights')} />
      <ActivityButton panel="trajectory" activePanel={activePanel} onClick={() => toggle('trajectory')} />
    </nav>
  );
}

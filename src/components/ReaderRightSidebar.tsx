import { useEffect, useMemo, useRef, useState } from 'react';
import { AIChatDialogue, AIChatInput, Button, Empty, Select, Tag, TextArea, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconDeleteStroked,
  IconEditStroked,
  IconPlus,
} from '@douyinfe/semi-icons';
import { AcpBridgeClient, getAcpBridgeUrl, type AcpBridgeMessage, type AcpStatus } from '../lib/acpClient';
import { useLearningStore } from '../store/useLearningStore';
import type { AcpProvider, BookItem, HighlightItem, RightPanel } from '../types';

const { Text } = Typography;

interface ReaderRightSidebarProps {
  book: BookItem;
  activePanel: RightPanel;
  width: number;
  selectedText?: string;
  onClearSelectedText: () => void;
  onChangePanel: (panel: RightPanel) => void;
  onJumpHighlight: (highlight: HighlightItem) => void;
}

const panelMeta = {
  ai: { label: 'AI 助手', icon: <IconAIStrokedLevel1 /> },
  notes: { label: '笔记', icon: <IconEditStroked /> },
  highlights: { label: '划线', icon: <IconBookmark /> },
};

const statusMeta: Record<AcpStatus, { label: string; color: 'grey' | 'blue' | 'green' | 'amber' | 'red' }> = {
  unavailable: { label: '仅本地可用', color: 'grey' },
  disconnected: { label: '未连接', color: 'grey' },
  connecting: { label: '连接中', color: 'blue' },
  ready: { label: '已连接', color: 'green' },
  generating: { label: '生成中', color: 'amber' },
  error: { label: '连接错误', color: 'red' },
};

function ActivityButton({
  panel,
  activePanel,
  onChange,
}: {
  panel: Exclude<RightPanel, null>;
  activePanel: RightPanel;
  onChange: (panel: RightPanel) => void;
}) {
  const active = panel === activePanel;
  const meta = panelMeta[panel];
  return (
    <Tooltip content={active ? `收起${meta.label}` : `打开${meta.label}`} position="left">
      <button
        type="button"
        className={`activity-button${active ? ' activity-button--active' : ''}`}
        aria-label={active ? `收起${meta.label}` : `打开${meta.label}`}
        aria-pressed={active}
        onClick={() => onChange(active ? null : panel)}
      >
        {meta.icon}
        <span>{panel === 'highlights' ? '划线' : panel === 'notes' ? '笔记' : 'AI'}</span>
      </button>
    </Tooltip>
  );
}

function extractInputText(inputContents?: Array<Record<string, unknown>>) {
  return (inputContents ?? [])
    .map((item) => item.type === 'text' && typeof item.text === 'string' ? item.text : '')
    .join('')
    .trim();
}

function AiPanel({
  bookId,
  selectedText,
  onClearSelectedText,
}: {
  bookId: string;
  selectedText?: string;
  onClearSelectedText: () => void;
}) {
  const allChats = useLearningStore((state) => state.chats);
  const addChatMessage = useLearningStore((state) => state.addChatMessage);
  const chats = useMemo(
    () => allChats.filter((message) => message.bookId === bookId),
    [allChats, bookId],
  );
  const [provider, setProvider] = useState<AcpProvider>('codex');
  const [status, setStatus] = useState<AcpStatus>(() => getAcpBridgeUrl() ? 'disconnected' : 'unavailable');
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const streamingRef = useRef('');
  const clientRef = useRef<AcpBridgeClient | null>(null);

  useEffect(() => {
    const handleMessage = (message: AcpBridgeMessage) => {
      if (message.type === 'status' && message.status) {
        setStatus(message.status);
        setStatusMessage(message.message ?? '');
        return;
      }
      if (message.type === 'notice') {
        setStatusMessage(message.message ?? '');
        return;
      }
      if (message.type === 'session-update') {
        const update = message.update;
        if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
          streamingRef.current += update.content.text ?? '';
          setStreamingContent(streamingRef.current);
        } else if (update?.sessionUpdate === 'tool_call') {
          setStatusMessage(`正在处理：${update.title ?? '工具调用'}`);
        }
        return;
      }
      if (message.type === 'turn-complete') {
        const answer = streamingRef.current.trim();
        if (answer) {
          addChatMessage({
            id: crypto.randomUUID(),
            bookId,
            role: 'assistant',
            content: answer,
            createdAt: Date.now(),
          });
        }
        streamingRef.current = '';
        setStreamingContent('');
        setStatusMessage('');
      }
    };

    const client = new AcpBridgeClient(handleMessage);
    clientRef.current = client;
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [addChatMessage, bookId]);

  const connect = () => clientRef.current?.connect(provider);
  const canSend = status === 'ready';

  const send = (content: string) => {
    const question = content.trim();
    if (!question) return;
    if (!canSend) {
      Toast.warning(status === 'unavailable' ? '请在项目目录运行 npm run dev:local' : '请先连接 Codex 或 Kimi CLI');
      return;
    }
    const prompt = selectedText
      ? `请结合下面选中的原文回答问题。\n\n原文：\n${selectedText}\n\n问题：\n${question}`
      : question;
    streamingRef.current = '';
    setStreamingContent('');
    addChatMessage({ id: crypto.randomUUID(), bookId, role: 'user', content: question, createdAt: Date.now() });
    if (clientRef.current?.prompt(prompt)) setStatus('generating');
  };

  const dialogueMessages = [
    ...chats.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      status: 'completed',
    })),
    ...(status === 'generating' ? [{
      id: 'streaming-assistant',
      role: 'assistant',
      content: streamingContent,
      status: 'in_progress',
    }] : []),
  ];
  const currentStatus = statusMeta[status];
  const references = selectedText ? [{ id: 'reader-selection', type: 'text', content: selectedText }] : [];

  return (
    <div className="right-panel__body ai-panel">
      <div className="ai-connection-bar">
        <Select
          size="small"
          aria-label="选择本地 AI 助手"
          value={provider}
          disabled={status === 'connecting' || status === 'generating'}
          onChange={(value) => {
            clientRef.current?.disconnect();
            setProvider(value as AcpProvider);
            setStatus(getAcpBridgeUrl() ? 'disconnected' : 'unavailable');
            setStatusMessage('');
          }}
          className="ai-provider-select"
        >
          <Select.Option value="codex">Codex</Select.Option>
          <Select.Option value="kimi">Kimi CLI</Select.Option>
        </Select>
        <Tag size="small" color={currentStatus.color}>{currentStatus.label}</Tag>
        <Button
          size="small"
          theme="light"
          disabled={status === 'unavailable' || status === 'connecting' || status === 'generating'}
          onClick={connect}
        >
          {status === 'ready' ? '重新连接' : '连接'}
        </Button>
      </div>

      {(statusMessage || status === 'unavailable') && (
        <Text size="small" type={status === 'error' ? 'danger' : 'tertiary'} className="ai-status-message">
          {statusMessage || '在线版本不能启动本地 CLI；请在项目目录运行 npm run dev:local。'}
        </Text>
      )}

      {selectedText && (
        <div className="selected-quote">
          <Text size="small" type="tertiary">已引用原文</Text>
          <p>{selectedText}</p>
          <div className="prompt-suggestions">
            <Button size="small" theme="light" disabled={!canSend} onClick={() => send('请用简单的话解释这段内容。')}>解释</Button>
            <Button size="small" theme="light" disabled={!canSend} onClick={() => send('请为这段内容举一个具体例子。')}>举例</Button>
            <Button size="small" theme="light" disabled={!canSend} onClick={() => send('这段内容在本章中的作用是什么？')}>联系上下文</Button>
          </div>
        </div>
      )}

      <div className="semi-chat-area" aria-live="polite">
        {dialogueMessages.length ? (
          <AIChatDialogue
            chats={dialogueMessages}
            align="leftAlign"
            mode="userBubble"
            roleConfig={{
              user: { name: '你' },
              assistant: { name: provider === 'codex' ? 'Codex' : 'Kimi CLI' },
            }}
          />
        ) : (
          <Empty title="从原文开始提问" description="连接本地助手后，选中一段文字或直接输入问题" />
        )}
      </div>

      <AIChatInput
        keepSkillAfterSend={false}
        placeholder={canSend ? '输入关于本书的问题…' : '连接本地助手后开始提问'}
        canSend={canSend}
        generating={status === 'generating'}
        references={references}
        onReferenceDelete={onClearSelectedText}
        onMessageSend={({ inputContents }) => send(extractInputText(inputContents as Array<Record<string, unknown>>))}
        onStopGenerate={() => clientRef.current?.cancel()}
        showUploadButton={false}
        showTemplateButton={false}
        showReference
        className="reader-ai-input"
      />
    </div>
  );
}

function NotesPanel({ bookId }: { bookId: string }) {
  const allNotes = useLearningStore((state) => state.notes);
  const addNote = useLearningStore((state) => state.addNote);
  const updateNote = useLearningStore((state) => state.updateNote);
  const deleteNote = useLearningStore((state) => state.deleteNote);
  const notes = useMemo(
    () => allNotes.filter((note) => note.bookId === bookId),
    [allNotes, bookId],
  );

  const createNote = () => {
    const timestamp = Date.now();
    addNote({ id: crypto.randomUUID(), bookId, content: '', createdAt: timestamp, updatedAt: timestamp });
  };

  return (
    <div className="right-panel__body notes-panel">
      <Button theme="light" icon={<IconPlus />} block onClick={createNote}>新建笔记</Button>
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
              <Button aria-label="删除笔记" icon={<IconDeleteStroked />} theme="borderless" type="danger" onClick={() => deleteNote(note.id)} />
            </Tooltip>
          </div>
        </article>
      )) : <Empty title="还没有笔记" description="阅读时记下问题、理解和联想" />}
    </div>
  );
}

function HighlightsPanel({
  bookId,
  onJumpHighlight,
}: {
  bookId: string;
  onJumpHighlight: (highlight: HighlightItem) => void;
}) {
  const allHighlights = useLearningStore((state) => state.highlights);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const highlights = useMemo(
    () => allHighlights.filter((highlight) => highlight.bookId === bookId),
    [allHighlights, bookId],
  );

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
            <Text size="small" type="tertiary">
              {highlight.chapter}{highlight.page ? ` · 第 ${highlight.page} 页` : ''}
            </Text>
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

export function ReaderRightSidebar({
  book,
  activePanel,
  width,
  selectedText,
  onClearSelectedText,
  onChangePanel,
  onJumpHighlight,
}: ReaderRightSidebarProps) {
  return (
    <div className="reader-right">
      {activePanel && (
        <aside className="right-panel" style={{ width }} aria-label={panelMeta[activePanel].label}>
          <div className="panel-titlebar">
            <div className="panel-titlebar__title">{panelMeta[activePanel].icon}<Text strong>{panelMeta[activePanel].label}</Text></div>
          </div>
          {activePanel === 'ai' && <AiPanel bookId={book.id} selectedText={selectedText} onClearSelectedText={onClearSelectedText} />}
          {activePanel === 'notes' && <NotesPanel bookId={book.id} />}
          {activePanel === 'highlights' && <HighlightsPanel bookId={book.id} onJumpHighlight={onJumpHighlight} />}
        </aside>
      )}
      <nav className="activity-bar" aria-label="阅读辅助工具">
        <ActivityButton panel="ai" activePanel={activePanel} onChange={onChangePanel} />
        <ActivityButton panel="notes" activePanel={activePanel} onChange={onChangePanel} />
        <ActivityButton panel="highlights" activePanel={activePanel} onChange={onChangePanel} />
      </nav>
    </div>
  );
}

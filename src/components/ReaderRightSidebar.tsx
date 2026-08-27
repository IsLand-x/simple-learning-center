import { useMemo, useState } from 'react';
import { Button, Empty, TextArea, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconClose,
  IconDeleteStroked,
  IconEditStroked,
  IconPlus,
  IconSend,
} from '@douyinfe/semi-icons';
import { formatRelativeTime } from '../lib/format';
import { useLearningStore } from '../store/useLearningStore';
import type { BookItem, HighlightItem, RightPanel } from '../types';

const { Text } = Typography;

interface ReaderRightSidebarProps {
  book: BookItem;
  activePanel: RightPanel;
  width: number;
  selectedText?: string;
  onChangePanel: (panel: RightPanel) => void;
  onJumpHighlight: (highlight: HighlightItem) => void;
}

const panelMeta = {
  ai: { label: 'AI 助手', icon: <IconAIStrokedLevel1 /> },
  notes: { label: '笔记', icon: <IconEditStroked /> },
  highlights: { label: '划线', icon: <IconBookmark /> },
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

function AiPanel({ bookId, selectedText }: { bookId: string; selectedText?: string }) {
  const [draft, setDraft] = useState('');
  const allChats = useLearningStore((state) => state.chats);
  const addChatMessage = useLearningStore((state) => state.addChatMessage);
  const chats = useMemo(
    () => allChats.filter((message) => message.bookId === bookId),
    [allChats, bookId],
  );

  const send = (content: string) => {
    const question = content.trim();
    if (!question) return;
    addChatMessage({ id: crypto.randomUUID(), bookId, role: 'user', content: question, createdAt: Date.now() });
    addChatMessage({
      id: crypto.randomUUID(),
      bookId,
      role: 'assistant',
      content: '问题已保存在本地。当前版本尚未连接模型服务；配置 AI 接口后，这里会结合原文生成回答。',
      createdAt: Date.now(),
    });
    setDraft('');
  };

  return (
    <div className="right-panel__body ai-panel">
      <div className="ai-status">
        <span className="ai-status__dot" />
        <Text size="small" type="tertiary">本地问答工作区 · AI 接口待配置</Text>
      </div>
      {selectedText && (
        <div className="selected-quote">
          <Text size="small" type="tertiary">已选择原文</Text>
          <p>{selectedText}</p>
          <div className="prompt-suggestions">
            <Button size="small" theme="light" onClick={() => send(`请用简单的话解释这段内容：\n“${selectedText}”`)}>解释</Button>
            <Button size="small" theme="light" onClick={() => send(`请为这段内容举一个具体例子：\n“${selectedText}”`)}>举例</Button>
            <Button size="small" theme="light" onClick={() => send(`这段内容在本章中的作用是什么？\n“${selectedText}”`)}>联系上下文</Button>
          </div>
        </div>
      )}
      <div className="chat-list" aria-live="polite">
        {chats.length ? chats.map((message) => (
          <div key={message.id} className={`chat-message chat-message--${message.role}`}>
            <Text size="small" type="tertiary">{message.role === 'user' ? '你' : 'AI 助手'}</Text>
            <p>{message.content}</p>
          </div>
        )) : (
          <Empty title="从原文开始提问" description="选中一段文字，或直接输入你的问题" />
        )}
      </div>
      <div className="chat-composer">
        <TextArea
          aria-label="输入关于本书的问题"
          autosize={{ minRows: 2, maxRows: 5 }}
          placeholder="输入关于本书的问题…"
          value={draft}
          onChange={setDraft}
          onEnterPress={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
        />
        <Button aria-label="发送问题" icon={<IconSend />} theme="solid" type="primary" disabled={!draft.trim()} onClick={() => send(draft)} />
      </div>
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
          <div className="note-card__footer">
            <Text size="small" type="tertiary">{note.content ? `已保存 · ${formatRelativeTime(note.updatedAt)}` : '自动保存在本地'}</Text>
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
  onChangePanel,
  onJumpHighlight,
}: ReaderRightSidebarProps) {
  return (
    <div className="reader-right">
      {activePanel && (
        <aside className="right-panel" style={{ width }} aria-label={panelMeta[activePanel].label}>
          <div className="panel-titlebar">
            <div className="panel-titlebar__title">{panelMeta[activePanel].icon}<Text strong>{panelMeta[activePanel].label}</Text></div>
            <Tooltip content="收起面板">
              <Button aria-label="收起右侧面板" icon={<IconClose />} theme="borderless" onClick={() => onChangePanel(null)} />
            </Tooltip>
          </div>
          {activePanel === 'ai' && <AiPanel bookId={book.id} selectedText={selectedText} />}
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

import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconColorPalette,
  IconComment,
  IconEditStroked,
  IconHistogram,
  IconHistory,
} from '@douyinfe/semi-icons';
import { markdownNoteTitle } from '../../../lib/markdownNotes';
import type {
  AiProvider,
  BookItem,
  ChatSession,
  HighlightItem,
  NoteItem,
  OpenAICompatibleConfig,
  RightPanel,
} from '../../../types';

export interface ReaderRightPanelProps {
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

export interface ReaderActivityBarProps {
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

export const mobilePanelItems: Array<{
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

export type AiStatus = 'unavailable' | 'ready' | 'generating' | 'error';

export function providerLabel(provider: AiProvider | undefined, configs: OpenAICompatibleConfig[]) {
  if (!provider) return '旧模型';
  return configs.find((config) => provider === `api:${config.id}`)?.name ?? 'API';
}

export function activityLabel(panel: Exclude<RightPanel, null>) {
  if (panel === 'ai') return 'AI';
  if (panel === 'history') return '历史';
  return panelMeta[panel].label;
}

export function extractInputText(inputContents?: Array<Record<string, unknown>>) {
  return (inputContents ?? [])
    .map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : ''))
    .join('')
    .trim();
}

export function makeConversationTitle(content: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || '关于本书的对话').replace(/\s+/g, ' ').slice(0, 32);
}

export function formatDuration(durationMs: number) {
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function mergeBookNoteContent(notes: NoteItem[]) {
  const orderedNotes = [...notes].sort((left, right) => left.createdAt - right.createdAt);
  if (orderedNotes.length <= 1) return orderedNotes[0]?.content ?? '';
  return orderedNotes
    .map((note) => {
      const content = note.content.trim();
      const title = note.title.trim() || markdownNoteTitle(content);
      return content ? `## ${title}\n\n${content}` : `## ${title}`;
    })
    .join('\n\n---\n\n');
}

export function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

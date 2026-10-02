import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconColorPalette,
  IconComment,
  IconEditStroked,
  IconHistogram,
  IconHistory,
  IconImage,
} from '@douyinfe/semi-icons';
import type { BookItem } from '../../../../../../contracts/books';
import type { ChatMessage, ChatSession } from '../../../../../../contracts/ai';
import type { HighlightItem } from '../../../../../../contracts/reading';
import type { RightPanel } from '../../../../../types/reader';

export interface ReaderRightPanelProps {
  book: BookItem;
  activePanel: Exclude<RightPanel, null>;
  conversationId: string;
  selectedQuote?: NonNullable<ChatMessage['quote']>;
  mobile?: boolean;
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
  resources: { label: '资源库', Icon: IconImage },
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
  { panel: 'resources', label: '资源库', ariaLabel: '打开资源库', Icon: IconImage },
  { panel: 'notes', label: '笔记', ariaLabel: '打开笔记', Icon: IconEditStroked },
  { panel: 'highlights', label: '高亮', ariaLabel: '打开高亮', Icon: IconBookmark },
  { panel: 'comments', label: '评论', ariaLabel: '打开评论', Icon: IconComment },
  { panel: 'trajectory', label: '轨迹', ariaLabel: '打开阅读轨迹', Icon: IconHistogram },
  { panel: 'style', label: '样式', ariaLabel: '打开阅读样式设置', Icon: IconColorPalette },
];

export function activityLabel(panel: Exclude<RightPanel, null>) {
  if (panel === 'ai') return 'AI';
  if (panel === 'history') return '历史';
  return panelMeta[panel].label;
}

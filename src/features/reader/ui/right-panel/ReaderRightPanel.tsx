import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Typography } from '@douyinfe/semi-ui';
import { useLearningStore } from '../../../../store/useLearningStore';
import { panelMeta, type ReaderRightPanelProps } from '../../model/rightPanelModel';
import { AiConversationPanel } from './AiConversationPanel';
import { BookNotePanel } from './BookNotePanel';
import { CommentsPanel } from './CommentsPanel';
import { ConversationHistoryPanel } from './ConversationHistoryPanel';
import { HighlightsPanel } from './HighlightsPanel';
import { ReadingTrajectoryPanel } from './ReadingTrajectoryPanel';

const { Text } = Typography;

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
  const hasCurrentConversation = useLearningStore(
    (state) =>
      state.chatSessions.some((session) => session.id === conversationId) ||
      state.chats.some((message) => message.conversationId === conversationId),
  );

  return (
    <aside
      className={`right-panel${activePanel === 'ai' ? ' right-panel--ai' : ''}`}
      aria-label={panelMeta[activePanel].label}
    >
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
          <ActivePanelIcon size="large" className="panel-tool-icon" />
          <Text strong>{panelMeta[activePanel].label}</Text>
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
        ) : null}
      </div>
      {activePanel === 'ai' && (
        <AiConversationPanel
          book={book}
          conversationId={conversationId}
          selectedText={selectedText}
          getCurrentText={getCurrentText}
          onClearSelectedText={onClearSelectedText}
        />
      )}
      {activePanel === 'history' && (
        <ConversationHistoryPanel
          bookId={book.id}
          activeConversationId={conversationId}
          onResumeConversation={onResumeConversation}
        />
      )}
      {activePanel === 'notes' && <BookNotePanel book={book} />}
      {activePanel === 'highlights' && (
        <HighlightsPanel
          bookId={book.id}
          focusedHighlightId={focusedHighlightId}
          onJumpHighlight={onJumpHighlight}
        />
      )}
      {activePanel === 'comments' && (
        <CommentsPanel bookId={book.id} onJumpHighlight={onJumpHighlight} />
      )}
      {activePanel === 'trajectory' && <ReadingTrajectoryPanel bookId={book.id} />}
    </aside>
  );
}

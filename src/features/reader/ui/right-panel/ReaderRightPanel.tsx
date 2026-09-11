import { useEffect, useRef, useState } from 'react';
import { IconPlus, IconSetting } from '@douyinfe/semi-icons';
import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { ReaderAiSettingsDialog } from '../../../../components/ReaderAiSettingsDialog';
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
  selectedQuote,
  mobile = false,
  getCurrentText,
  onClearSelectedText,
  onStartNewConversation,
  onResumeConversation,
  onJumpHighlight,
  focusedHighlightId,
}: ReaderRightPanelProps) {
  const [settingsVisible, setSettingsVisible] = useState(false);
  const settingsHistoryActiveRef = useRef(false);
  const ActivePanelIcon = panelMeta[activePanel].Icon;
  const hasCurrentConversation = useLearningStore(
    (state) =>
      state.chatSessions.some((session) => session.id === conversationId) ||
      state.chats.some((message) => message.conversationId === conversationId),
  );

  useEffect(() => {
    if (!mobile) return undefined;
    const handlePopState = (event: PopStateEvent) => {
      if (!settingsHistoryActiveRef.current) return;
      const state = event.state as { learningCenterReaderAiSettings?: boolean } | null;
      if (state?.learningCenterReaderAiSettings) return;
      settingsHistoryActiveRef.current = false;
      setSettingsVisible(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [mobile]);

  useEffect(() => {
    if (!mobile) return;
    if (settingsVisible && !settingsHistoryActiveRef.current) {
      const currentState = window.history.state;
      window.history.pushState(
        {
          ...(currentState && typeof currentState === 'object' ? currentState : {}),
          learningCenterReaderAiSettings: true,
        },
        '',
        window.location.href,
      );
      settingsHistoryActiveRef.current = true;
      return;
    }
    if (!settingsVisible && settingsHistoryActiveRef.current) {
      settingsHistoryActiveRef.current = false;
      const currentState = window.history.state as {
        learningCenterReaderAiSettings?: boolean;
      } | null;
      if (currentState?.learningCenterReaderAiSettings) window.history.back();
    }
  }, [mobile, settingsVisible]);

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
        {activePanel === 'ai' && (
          <div className="panel-titlebar__actions">
            {hasCurrentConversation && (
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
            )}
            <Tooltip content="AI 助手设置" position="bottomRight">
              <Button
                aria-label="打开 AI 助手设置"
                className="panel-titlebar__settings"
                icon={<IconSetting />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => setSettingsVisible(true)}
              />
            </Tooltip>
          </div>
        )}
      </div>
      {activePanel === 'ai' && (
        <AiConversationPanel
          book={book}
          conversationId={conversationId}
          selectedQuote={selectedQuote}
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
      <ReaderAiSettingsDialog
        visible={activePanel === 'ai' && settingsVisible}
        onCancel={() => setSettingsVisible(false)}
      />
    </aside>
  );
}

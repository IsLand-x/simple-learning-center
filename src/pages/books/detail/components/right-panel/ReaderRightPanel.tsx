import { BookResourcesPanel, BookResourcesProvider } from './BookResourcesPanel';
import { useEffect, useRef, useState } from 'react';
import { IconPlus, IconSetting } from '@douyinfe/semi-icons';
import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { ReaderAiSettingsDialog } from '../ReaderAiSettingsDialog';
import { panelMeta, type ReaderRightPanelProps } from '../../store/model/rightPanelModel';
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
    <BookResourcesProvider key={book.id} bookId={book.id}>
      <aside
        className={`right-panel w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-1)] min-w-0 [max-width:none] ${activePanel === 'ai' ? ' right-panel--ai' : ''}`}
        aria-label={panelMeta[activePanel].label}
      >
        <div className="panel-titlebar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
          <div className="panel-titlebar__title min-w-0 [color:var(--semi-color-text-1)]">
            <ActivePanelIcon size="large" className="panel-tool-icon" />
            <Text strong>{panelMeta[activePanel].label}</Text>
          </div>
          {activePanel === 'ai' && (
            <div className="panel-titlebar__actions min-w-0 [gap:2px]">
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
            key={conversationId}
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
        {activePanel === 'resources' && <BookResourcesPanel />}
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
    </BookResourcesProvider>
  );
}

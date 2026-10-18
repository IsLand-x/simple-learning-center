import { IconPlus, IconSetting } from '@douyinfe/semi-icons';
import { Button, Select, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { ConversationHistoryPanel } from '../AssistantPanel/ConversationHistoryPanel';
import { AiConversationPanel } from '../AssistantPanel/AiConversationPanel';
import { ReaderAiSettingsDialog } from '../AssistantPanel/ReaderAiSettingsDialog';
import { BookNotePanel } from '../BookNotePanel/BookNotePanel';
import { CommentsPanel } from '../CommentsPanel';
import { GlossaryPanel } from '../GlossaryPanel/GlossaryPanel';
import { HighlightsPanel } from '../HighlightsPanel';
import { BookResourcesProvider } from '../ResourcesPanel/BookResourcesProvider';
import { BookResourcesPanel } from '../ResourcesPanel/BookResourcesPanel';
import { ReadingTrajectoryPanel } from '../TrajectoryPanel/ReadingTrajectoryPanel';
import { panelMeta, type ReaderRightPanelProps } from './model';
import type { AnnotationSortOrder } from '../annotationSorting';
import { useAnnotationSortHistory } from './useAnnotationSortHistory';

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
  const [sortOrders, setSortOrders] = useState<{
    glossary: AnnotationSortOrder;
    highlights: AnnotationSortOrder;
    comments: AnnotationSortOrder;
  }>({ glossary: 'created-desc', highlights: 'created-desc', comments: 'created-desc' });
  const sortablePanel =
    activePanel === 'glossary' || activePanel === 'highlights' || activePanel === 'comments'
      ? activePanel
      : null;
  const sortDropdown = useAnnotationSortHistory(mobile, sortablePanel);
  const sortLabelId = useId();
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
          {sortablePanel && (
            <div className="shrink-0">
              <span id={sortLabelId} className="sr-only">
                {panelMeta[sortablePanel].label}排序
              </span>
              <Select
                key={sortablePanel}
                ref={sortDropdown.selectRef}
                onDropdownVisibleChange={sortDropdown.onDropdownVisibleChange}
                aria-labelledby={sortLabelId}
                className="w-[146px] shrink-0 mobile:min-h-[44px]"
                size="small"
                value={sortOrders[sortablePanel]}
                optionList={[
                  {
                    value: 'created-desc',
                    label: '添加时间倒序',
                    className: 'mobile:min-h-[44px]',
                  },
                  { value: 'created-asc', label: '添加时间正序', className: 'mobile:min-h-[44px]' },
                  { value: 'position', label: '书籍位置', className: 'mobile:min-h-[44px]' },
                ]}
                onChange={(value) => {
                  if (value === 'created-desc' || value === 'created-asc' || value === 'position') {
                    setSortOrders((current) => ({ ...current, [sortablePanel]: value }));
                  }
                }}
              />
            </div>
          )}
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
        {activePanel === 'glossary' && (
          <GlossaryPanel
            book={book}
            onJump={onJumpHighlight}
            getCurrentText={getCurrentText}
            sortOrder={sortOrders.glossary}
          />
        )}
        {activePanel === 'highlights' && (
          <HighlightsPanel
            bookId={book.id}
            focusedHighlightId={focusedHighlightId}
            sortOrder={sortOrders.highlights}
            onJumpHighlight={onJumpHighlight}
          />
        )}
        {activePanel === 'comments' && (
          <CommentsPanel
            bookId={book.id}
            onJumpHighlight={onJumpHighlight}
            sortOrder={sortOrders.comments}
          />
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

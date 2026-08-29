import type { RefObject } from 'react';
import { SideSheet, Typography } from '@douyinfe/semi-ui';
import { IconColorPalette } from '@douyinfe/semi-icons';
import type { BookItem, ChatSession, HighlightItem, ReaderPreferences, TocItem } from '../types';
import {
  ReaderMobilePanelTabs,
  ReaderRightPanel,
  type MobileReaderPanel,
} from './ReaderRightSidebar';
import type { ReaderSurfaceHandle } from './ReaderSurface';
import { ReaderMobileToolbar, ReaderStylePanel } from './ReaderToolbar';
import { TableOfContents } from './TableOfContents';

const { Text } = Typography;

interface ReaderMobileChromeProps {
  activeHref?: string;
  activePanel: MobileReaderPanel | null;
  book: BookItem;
  compactTocOpen: boolean;
  conversationId: string;
  focusedHighlightId?: string | null;
  panelQuote?: string | null;
  preferences: ReaderPreferences;
  readerRef: RefObject<ReaderSurfaceHandle>;
  onChangePanel: (panel: MobileReaderPanel | null) => void;
  onClearSelectedText: () => void;
  onCloseToc: () => void;
  onJumpHighlight: (highlight: HighlightItem) => void;
  onNext: () => void;
  onPrev: () => void;
  onResumeConversation: (session: ChatSession) => void;
  onSelectToc: (item: TocItem) => void;
  onStartNewConversation: () => void;
  onToggleToc: () => void;
  onUpdatePreferences: (changes: Partial<ReaderPreferences>) => void;
}

export function ReaderMobileChrome({
  activeHref,
  activePanel,
  book,
  compactTocOpen,
  conversationId,
  focusedHighlightId,
  panelQuote,
  preferences,
  readerRef,
  onChangePanel,
  onClearSelectedText,
  onCloseToc,
  onJumpHighlight,
  onNext,
  onPrev,
  onResumeConversation,
  onSelectToc,
  onStartNewConversation,
  onToggleToc,
  onUpdatePreferences,
}: ReaderMobileChromeProps) {
  return (
    <div className="reader-mobile-chrome">
      <div className="reader-mobile-chrome__toolbar">
        <ReaderMobileToolbar
          tocCollapsed={!compactTocOpen}
          moreOpen={Boolean(activePanel)}
          onNext={onNext}
          onPrev={onPrev}
          onToggleMore={() => onChangePanel(activePanel ? null : 'ai')}
          onToggleToc={onToggleToc}
        />
      </div>

      <SideSheet
        aria-label="书籍目录"
        bodyStyle={{ padding: 0, overflow: 'hidden' }}
        className="mobile-toc-sheet"
        closable={false}
        mask
        maskClosable
        placement="left"
        visible={compactTocOpen}
        width="min(86vw, 340px)"
        zIndex={38}
        onCancel={onCloseToc}
      >
        <TableOfContents
          items={book.toc}
          activeHref={activeHref}
          progress={book.progress}
          onSelect={onSelectToc}
        />
      </SideSheet>

      <SideSheet
        aria-label={activePanel === 'style' ? '阅读样式设置' : activePanel ? `阅读辅助工具：${activePanel}` : '阅读辅助工具'}
        bodyStyle={{ padding: 0, overflow: 'hidden' }}
        className="mobile-reader-sheet mobile-assistant-sheet"
        closable={false}
        height="90dvh"
        mask
        maskClosable
        placement="bottom"
        visible={Boolean(activePanel)}
        zIndex={38}
        onCancel={() => onChangePanel(null)}
      >
        <div className="mobile-sheet-grabber" aria-hidden="true" />
        {activePanel && (
          <>
            {activePanel === 'style' ? (
              <aside className="right-panel mobile-style-panel" aria-label="阅读样式设置">
                <div className="panel-titlebar">
                  <div className="panel-titlebar__title">
                    <IconColorPalette size="large" className="panel-tool-icon" />
                    <Text strong>阅读样式</Text>
                  </div>
                </div>
                <div className="mobile-style-panel__body">
                  <ReaderStylePanel
                    preferences={preferences}
                    onChangePreferences={onUpdatePreferences}
                  />
                </div>
              </aside>
            ) : (
              <ReaderRightPanel
                book={book}
                activePanel={activePanel}
                conversationId={conversationId}
                selectedText={panelQuote ?? undefined}
                getCurrentText={() => readerRef.current?.getCurrentText() ?? ''}
                onClearSelectedText={onClearSelectedText}
                onStartNewConversation={onStartNewConversation}
                onResumeConversation={onResumeConversation}
                onJumpHighlight={onJumpHighlight}
                focusedHighlightId={focusedHighlightId}
              />
            )}
            <ReaderMobilePanelTabs
              activePanel={activePanel}
              onChangePanel={onChangePanel}
            />
          </>
        )}
      </SideSheet>
    </div>
  );
}

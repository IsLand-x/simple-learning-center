import type { RefObject } from 'react';
import { SideSheet, Typography } from '@douyinfe/semi-ui';
import { IconColorPalette } from '@douyinfe/semi-icons';
import type {
  BookItem,
  ChatMessage,
  ChatSession,
  HighlightItem,
  ReaderPreferences,
  TocItem,
} from '../../../../util/types';
import {
  ReaderMobilePanelTabs,
  ReaderRightPanel,
  type MobileReaderPanel,
} from './ReaderRightSidebar';
import type { ReaderSurfaceHandle } from './ReaderSurface';
import { ReaderMobileToolbar } from './ReaderMobileToolbar';
import { ReaderStylePanel } from '../../../../components/reading/ReaderStylePanel';
import { TableOfContents } from './TableOfContents';

const { Text } = Typography;

interface ReaderMobileChromeProps {
  activeHref?: string;
  activePanel: MobileReaderPanel | null;
  book: BookItem;
  compactTocOpen: boolean;
  conversationId: string;
  focusedHighlightId?: string | null;
  panelQuote?: NonNullable<ChatMessage['quote']> | null;
  preferences: ReaderPreferences;
  readerRef: RefObject<ReaderSurfaceHandle>;
  visible: boolean;
  onChangePanel: (panel: MobileReaderPanel | null) => void;
  onClearSelectedText: () => void;
  onCloseToc: () => void;
  onJumpHighlight: (highlight: HighlightItem) => void;
  onNext: () => void;
  onPrev: () => void;
  onResumeConversation: (session: ChatSession) => void;
  onSelectToc: (item: TocItem) => void;
  onReturnToProgress?: () => void;
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
  visible,
  onChangePanel,
  onClearSelectedText,
  onCloseToc,
  onJumpHighlight,
  onNext,
  onPrev,
  onResumeConversation,
  onSelectToc,
  onReturnToProgress,
  onStartNewConversation,
  onToggleToc,
  onUpdatePreferences,
}: ReaderMobileChromeProps) {
  return (
    <div className="reader-mobile-chrome">
      <div
        aria-hidden={!visible}
        className={`reader-mobile-chrome__toolbar mobile:absolute mobile:[right:0] mobile:[bottom:0] mobile:[left:0] mobile:[z-index:30] mobile:min-w-0 mobile:overflow-hidden mobile:[overscroll-behavior:none] mobile:[transition:opacity_140ms_ease,_transform_180ms_ease,_visibility_0s_linear] ${visible ? '' : ' reader-mobile-chrome__toolbar--hidden'}`}
      >
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
        className="mobile-toc-sheet mobile:pointer-events-none"
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
          activeItemAlignment="center"
          activeItemVisible={compactTocOpen}
          items={book.toc}
          activeHref={activeHref}
          currentPage={book.currentPage}
          progress={book.progress}
          onReturnToProgress={onReturnToProgress}
          onSelect={onSelectToc}
        />
      </SideSheet>

      <SideSheet
        aria-label={
          activePanel === 'style'
            ? '阅读样式设置'
            : activePanel
              ? `阅读辅助工具：${activePanel}`
              : '阅读辅助工具'
        }
        bodyStyle={{ padding: 0, overflow: 'hidden' }}
        className="mobile-reader-sheet mobile:pointer-events-none mobile-assistant-sheet"
        closable={false}
        height="90dvh"
        mask
        maskClosable
        placement="bottom"
        visible={Boolean(activePanel)}
        zIndex={38}
        onCancel={() => onChangePanel(null)}
      >
        <div
          className="mobile-sheet-grabber mobile:[width:36px] mobile:[height:4px] mobile:[flex:0_0_auto] mobile:[margin:8px_auto_4px] mobile:[border-radius:999px] mobile:[background:var(--semi-color-fill-2)]"
          aria-hidden="true"
        />
        {activePanel && (
          <>
            {activePanel === 'style' ? (
              <aside
                className="right-panel w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-1)] min-w-0 [max-width:none] mobile-style-panel"
                aria-label="阅读样式设置"
              >
                <div className="panel-titlebar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
                  <div className="panel-titlebar__title min-w-0 [color:var(--semi-color-text-1)]">
                    <IconColorPalette size="large" className="panel-tool-icon" />
                    <Text strong>阅读样式</Text>
                  </div>
                </div>
                <div className="mobile-style-panel__body mobile:min-h-0 mobile:overflow-auto">
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
                selectedQuote={panelQuote ?? undefined}
                mobile
                getCurrentText={() => readerRef.current?.getCurrentText() ?? ''}
                onClearSelectedText={onClearSelectedText}
                onStartNewConversation={onStartNewConversation}
                onResumeConversation={onResumeConversation}
                onJumpHighlight={onJumpHighlight}
                focusedHighlightId={focusedHighlightId}
              />
            )}
            <ReaderMobilePanelTabs activePanel={activePanel} onChangePanel={onChangePanel} />
          </>
        )}
      </SideSheet>
    </div>
  );
}

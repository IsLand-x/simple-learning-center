import type { ReactNode, RefObject } from 'react';
import { Allotment } from 'allotment';
import { clamp } from '../lib/format';
import type { BookItem, ChatSession, HighlightItem, ReaderPreferences, RightPanel, TocItem } from '../types';
import { ReaderActivityBar, ReaderRightPanel } from './ReaderRightSidebar';
import type { ReaderSurfaceHandle } from './ReaderSurface';
import { TableOfContents } from './TableOfContents';

interface ReaderWorkspaceProps {
  activeHref?: string;
  activePanel: RightPanel;
  book: BookItem;
  children: ReactNode;
  compactReader: boolean;
  compactTocOpen: boolean;
  conversationId: string;
  desktop: boolean;
  focusedHighlightId?: string | null;
  panelQuote?: string | null;
  preferences: ReaderPreferences;
  readerRef: RefObject<ReaderSurfaceHandle>;
  workspaceRef: RefObject<HTMLDivElement>;
  onChangePanel: (panel: RightPanel) => void;
  onClearSelectedText: () => void;
  onJumpHighlight: (highlight: HighlightItem) => void;
  onResumeConversation: (session: ChatSession) => void;
  onSelectToc: (item: TocItem, closeOverlay: boolean) => void;
  onStartNewConversation: () => void;
  onUpdatePreferences: (changes: Partial<ReaderPreferences>) => void;
}

export function ReaderWorkspace({
  activeHref,
  activePanel,
  book,
  children,
  compactReader,
  compactTocOpen,
  conversationId,
  desktop,
  focusedHighlightId,
  panelQuote,
  preferences,
  readerRef,
  workspaceRef,
  onChangePanel,
  onClearSelectedText,
  onJumpHighlight,
  onResumeConversation,
  onSelectToc,
  onStartNewConversation,
  onUpdatePreferences,
}: ReaderWorkspaceProps) {
  const tocVisible = desktop && !compactReader && !preferences.tocCollapsed;
  const panelVisible = desktop && Boolean(activePanel);

  return (
    <div ref={workspaceRef} className="reader-workspace">
      {desktop && compactReader && compactTocOpen && (
        <div className="toc-column toc-column--overlay">
          <TableOfContents
            items={book.toc}
            activeHref={activeHref}
            progress={book.progress}
            onSelect={(item) => onSelectToc(item, true)}
          />
        </div>
      )}
      <Allotment
        proportionalLayout={false}
        separator={tocVisible}
        onDragEnd={(sizes) => {
          if (tocVisible && sizes[0]) {
            onUpdatePreferences({ tocWidth: clamp(sizes[0], 220, 400) });
          }
        }}
      >
        <Allotment.Pane
          visible={tocVisible}
          preferredSize={preferences.tocWidth}
          minSize={220}
          maxSize={400}
        >
          <div className="toc-column">
            <TableOfContents
              items={book.toc}
              activeHref={activeHref}
              progress={book.progress}
              onSelect={(item) => onSelectToc(item, false)}
            />
          </div>
        </Allotment.Pane>

        <Allotment.Pane minSize={0}>
          <div className="reader-main">
            <Allotment
              proportionalLayout={false}
              separator={panelVisible}
              onDragEnd={(sizes) => {
                if (panelVisible && sizes[1]) {
                  onUpdatePreferences({ panelWidth: clamp(sizes[1], 320, 720) });
                }
              }}
            >
              <Allotment.Pane minSize={0}>
                <section className="reader-center">
                  <div className="reader-content">{children}</div>
                </section>
              </Allotment.Pane>
              <Allotment.Pane
                visible={panelVisible}
                preferredSize={preferences.panelWidth}
                minSize={compactReader ? 0 : 320}
                maxSize={720}
              >
                {desktop && activePanel && (
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
              </Allotment.Pane>
            </Allotment>
            {desktop && (
              <ReaderActivityBar
                activePanel={activePanel}
                onChangePanel={onChangePanel}
              />
            )}
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}

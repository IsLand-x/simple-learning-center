import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReaderSelectionOverlays } from '../../../components/reading/ReaderSelectionOverlays';
import { useLearningStore } from '../../../store/useLearningStore';
import type { MobileReaderPanel } from './components/ReaderPanel/model';
import { ReaderSurface } from './components/ReaderSurface/ReaderSurface';
import type { ReaderSurfaceHandle } from './components/ReaderSurface/type';
import { ReaderPageHeader } from './components/Toolbar/ReaderPageHeader';
import { ReaderMobileChrome } from './components/ReaderMobileChrome';
import { ReaderWorkspace } from './components/ReaderWorkspace';
import { useReaderAnnotations } from './store/useReaderAnnotations';
import { useReaderConversations } from './store/useReaderConversations';
import { useReaderLayout } from './store/useReaderLayout';
import { useReaderNavigation } from './store/useReaderNavigation';

import { MissingReaderBook } from './components/MissingReaderBook';

export function ReaderPageContent() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const book = useLearningStore((state) => state.books.find((item) => item.id === bookId));
  const themeMode = useLearningStore((state) => state.themeMode);
  const preferences = useLearningStore((state) => state.readerPreferences);
  const setPreferences = useLearningStore((state) => state.setReaderPreferences);
  const readerRef = useRef<ReaderSurfaceHandle>(null);
  const layout = useReaderLayout(book?.id);
  const navigation = useReaderNavigation(book, readerRef, layout.closeToc);
  const conversations = useReaderConversations(book?.id, changeActivePanel);
  const annotations = useReaderAnnotations({
    book,
    readerRef,
    currentChapter: navigation.currentChapter,
    onShowHighlights: layout.revealHighlights,
    onOpenAssistant: () => changeActivePanel('ai'),
    setPanelQuote: conversations.setPanelQuote,
  });
  function changeActivePanel(panel: MobileReaderPanel | null) {
    layout.changePanel(panel);
    annotations.dismissActions();
  }
  if (!book) return <MissingReaderBook onBack={() => navigate('/')} />;
  return (
    <main
      className={`reader-page w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)] mobile:relative mobile:[padding-bottom:calc(var(--mobile-reader-toolbar-height)_+_env(safe-area-inset-bottom))] ${layout.mobileReader && !layout.mobileChromeVisible ? ' reader-page--mobile-immersive' : ''}`}
    >
      <ReaderPageHeader
        book={book}
        currentChapter={navigation.currentChapter}
        mobileReader={layout.mobileReader}
        mobileChromeVisible={layout.mobileChromeVisible}
        mobileOverlayOpen={layout.mobileOverlayOpen}
        preferences={preferences}
        stylePopoverVisible={layout.stylePopoverVisible}
        tocCollapsed={layout.compactReader ? !layout.compactTocOpen : preferences.tocCollapsed}
        onBack={() => {
          if (layout.mobileOverlayOpen) {
            layout.closeMobileOverlay();
            return;
          }
          navigate('/');
        }}
        onChangePreferences={setPreferences}
        onNext={() => readerRef.current?.next()}
        onPrev={() => readerRef.current?.prev()}
        onStylePopoverVisibleChange={layout.setStylePopoverVisible}
        onToggleToc={() => {
          if (layout.compactReader) {
            layout.setCompactTocOpen((open) => !open);
          } else {
            setPreferences({ tocCollapsed: !preferences.tocCollapsed });
          }
        }}
      />

      <ReaderWorkspace
        activeHref={navigation.activeHref}
        activePanel={layout.activePanel === 'style' ? null : layout.activePanel}
        book={book}
        compactReader={layout.compactReader}
        compactTocOpen={layout.compactTocOpen}
        conversationId={conversations.conversationId}
        desktop={!layout.mobileReader}
        focusedHighlightId={annotations.focusedHighlightId}
        panelQuote={conversations.panelQuote}
        preferences={preferences}
        readerRef={readerRef}
        workspaceRef={layout.workspaceRef}
        onChangePanel={conversations.openActivityPanel}
        onClearSelectedText={() => conversations.setPanelQuote(null)}
        onJumpHighlight={annotations.jumpToHighlight}
        onResumeConversation={conversations.resumeConversation}
        onSelectToc={navigation.selectToc}
        onReturnToProgress={navigation.returnToProgress}
        onStartNewConversation={conversations.startNewConversation}
        onUpdatePreferences={setPreferences}
      >
        <ReaderSurface
          ref={readerRef}
          book={book}
          compactLayout={layout.mobileReader}
          preferences={preferences}
          themeMode={themeMode}
          highlights={annotations.readerHighlights}
          onLocationChange={navigation.handleLocationChange}
          onSelection={annotations.setSelection}
          onHighlightClick={annotations.showHighlightActions}
          onContentInteraction={() => {
            layout.setStylePopoverVisible(false);
            annotations.dismissActions();
          }}
          onCenterTap={() => {
            if (!layout.mobileReader || layout.mobileOverlayOpen) return;
            layout.setMobileChromeVisible((visible) => !visible);
          }}
        />
        <ReaderSelectionOverlays
          activeHighlight={annotations.activeHighlight}
          activeHighlightTarget={annotations.activeHighlightTarget}
          commentDraft={annotations.commentDraft}
          commentingHighlightId={annotations.commentingHighlightId}
          pendingCommentSelection={annotations.pendingCommentSelection}
          selection={annotations.selection}
          onAskAboutHighlight={annotations.askAboutHighlight}
          onAskAboutSelection={annotations.askAboutSelection}
          onCancelCommentEditing={annotations.cancelCommentEditing}
          onCancelHighlight={annotations.cancelHighlight}
          onChangeCommentDraft={annotations.setCommentDraft}
          onCreateComment={annotations.createCommentFromSelection}
          onEditHighlightComment={annotations.editHighlightComment}
          onSaveHighlight={annotations.saveHighlight}
          onSaveHighlightComment={annotations.saveHighlightComment}
          onViewHighlight={annotations.viewHighlight}
        />
      </ReaderWorkspace>
      {layout.mobileReader && (
        <ReaderMobileChrome
          activeHref={navigation.activeHref}
          activePanel={layout.activePanel}
          book={book}
          compactTocOpen={layout.compactTocOpen}
          conversationId={conversations.conversationId}
          focusedHighlightId={annotations.focusedHighlightId}
          panelQuote={conversations.panelQuote}
          preferences={preferences}
          readerRef={readerRef}
          visible={layout.mobileChromeVisible}
          onChangePanel={conversations.openActivityPanel}
          onClearSelectedText={() => conversations.setPanelQuote(null)}
          onCloseToc={() => layout.setCompactTocOpen(false)}
          onJumpHighlight={annotations.jumpToHighlight}
          onNext={() => readerRef.current?.next()}
          onPrev={() => readerRef.current?.prev()}
          onResumeConversation={conversations.resumeConversation}
          onSelectToc={navigation.selectToc}
          onReturnToProgress={navigation.returnToProgress}
          onStartNewConversation={conversations.startNewConversation}
          onToggleToc={() => {
            const nextOpen = !layout.compactTocOpen;
            if (nextOpen) changeActivePanel(null);
            layout.setCompactTocOpen(nextOpen);
          }}
          onUpdatePreferences={setPreferences}
        />
      )}
    </main>
  );
}

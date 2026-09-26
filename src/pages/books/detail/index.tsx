import { useParams } from 'react-router-dom';
import { ReaderMobileChrome } from './components/ReaderMobileChrome';
import { ReaderSurface } from './components/ReaderSurface';
import { ReaderSelectionOverlays } from '../../../components/reading/ReaderSelectionOverlays';
import { ReaderWorkspace } from './components/ReaderWorkspace';
import { ReaderAiActivityProvider } from './components/ReaderAiActivityProvider';
import { MissingReaderBook, ReaderPageHeader } from './components/ReaderPageHeader';
import { useReaderPageStore } from './store/useReaderPageStore';

export function ReaderPage() {
  const { bookId = '' } = useParams();
  return (
    <ReaderAiActivityProvider key={bookId} bookId={bookId}>
      <ReaderPageContent />
    </ReaderAiActivityProvider>
  );
}

function ReaderPageContent() {
  const reader = useReaderPageStore();
  if (reader.status === 'missing') return <MissingReaderBook onBack={() => reader.navigate('/')} />;
  const {
    activeHighlight,
    activeHighlightTarget,
    activeHref,
    activePanel,
    book,
    closeMobileOverlay,
    commentDraft,
    commentingHighlightId,
    compactReader,
    compactTocOpen,
    conversationId,
    currentChapter,
    focusedHighlightId,
    handleDelete,
    handleLocationChange,
    mobileChromeVisible,
    mobileOverlayOpen,
    mobileReader,
    navigate,
    panelQuote,
    pendingCommentSelection,
    preferences,
    readerHighlights,
    readerRef,
    returnToProgress,
    selectToc,
    selection,
    setActiveHighlightTarget,
    setCommentDraft,
    setCommentingHighlightId,
    setCompactTocOpen,
    setMobileChromeVisible,
    setPanelQuote,
    setPendingCommentSelection,
    setPreferences,
    setSelection,
    setStylePopoverVisible,
    stylePopoverVisible,
    themeMode,
    workspaceRef,
    changeActivePanel,
    saveHighlight,
    showHighlightActions,
    cancelHighlight,
    viewHighlight,
    editHighlightComment,
    createCommentFromSelection,
    cancelCommentEditing,
    saveHighlightComment,
    askAboutSelection,
    askAboutHighlight,
    jumpToHighlight,
    startNewConversation,
    resumeConversation,
    openActivityPanel,
  } = reader;
  return (
    <main
      className={`reader-page w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)] mobile:relative mobile:[padding-bottom:calc(var(--mobile-reader-toolbar-height)_+_env(safe-area-inset-bottom))] ${mobileReader && !mobileChromeVisible ? ' reader-page--mobile-immersive' : ''}`}
    >
      <ReaderPageHeader
        book={book}
        currentChapter={currentChapter}
        mobileReader={mobileReader}
        mobileChromeVisible={mobileChromeVisible}
        mobileOverlayOpen={mobileOverlayOpen}
        preferences={preferences}
        stylePopoverVisible={stylePopoverVisible}
        tocCollapsed={compactReader ? !compactTocOpen : preferences.tocCollapsed}
        onBack={() => {
          if (mobileOverlayOpen) {
            closeMobileOverlay();
            return;
          }
          navigate('/');
        }}
        onChangePreferences={setPreferences}
        onDelete={handleDelete}
        onNext={() => readerRef.current?.next()}
        onPrev={() => readerRef.current?.prev()}
        onStylePopoverVisibleChange={setStylePopoverVisible}
        onToggleToc={() => {
          if (compactReader) {
            setCompactTocOpen((open) => !open);
          } else {
            setPreferences({ tocCollapsed: !preferences.tocCollapsed });
          }
        }}
      />

      <ReaderWorkspace
        activeHref={activeHref}
        activePanel={activePanel === 'style' ? null : activePanel}
        book={book}
        compactReader={compactReader}
        compactTocOpen={compactTocOpen}
        conversationId={conversationId}
        desktop={!mobileReader}
        focusedHighlightId={focusedHighlightId}
        panelQuote={panelQuote}
        preferences={preferences}
        readerRef={readerRef}
        workspaceRef={workspaceRef}
        onChangePanel={openActivityPanel}
        onClearSelectedText={() => setPanelQuote(null)}
        onJumpHighlight={jumpToHighlight}
        onResumeConversation={resumeConversation}
        onSelectToc={selectToc}
        onReturnToProgress={returnToProgress}
        onStartNewConversation={startNewConversation}
        onUpdatePreferences={setPreferences}
      >
        <ReaderSurface
          ref={readerRef}
          book={book}
          compactLayout={mobileReader}
          preferences={preferences}
          themeMode={themeMode}
          highlights={readerHighlights}
          onLocationChange={handleLocationChange}
          onSelection={setSelection}
          onHighlightClick={showHighlightActions}
          onContentInteraction={() => {
            setStylePopoverVisible(false);
            setActiveHighlightTarget(null);
            setCommentingHighlightId(null);
            setPendingCommentSelection(null);
          }}
          onCenterTap={() => {
            if (!mobileReader || mobileOverlayOpen) return;
            setMobileChromeVisible((visible) => !visible);
          }}
        />
        <ReaderSelectionOverlays
          activeHighlight={activeHighlight}
          activeHighlightTarget={activeHighlightTarget}
          commentDraft={commentDraft}
          commentingHighlightId={commentingHighlightId}
          pendingCommentSelection={pendingCommentSelection}
          selection={selection}
          onAskAboutHighlight={askAboutHighlight}
          onAskAboutSelection={askAboutSelection}
          onCancelCommentEditing={cancelCommentEditing}
          onCancelHighlight={cancelHighlight}
          onChangeCommentDraft={setCommentDraft}
          onCreateComment={createCommentFromSelection}
          onEditHighlightComment={editHighlightComment}
          onSaveHighlight={saveHighlight}
          onSaveHighlightComment={saveHighlightComment}
          onViewHighlight={viewHighlight}
        />
      </ReaderWorkspace>
      {mobileReader && (
        <ReaderMobileChrome
          activeHref={activeHref}
          activePanel={activePanel}
          book={book}
          compactTocOpen={compactTocOpen}
          conversationId={conversationId}
          focusedHighlightId={focusedHighlightId}
          panelQuote={panelQuote}
          preferences={preferences}
          readerRef={readerRef}
          visible={mobileChromeVisible}
          onChangePanel={openActivityPanel}
          onClearSelectedText={() => setPanelQuote(null)}
          onCloseToc={() => setCompactTocOpen(false)}
          onJumpHighlight={jumpToHighlight}
          onNext={() => readerRef.current?.next()}
          onPrev={() => readerRef.current?.prev()}
          onResumeConversation={resumeConversation}
          onSelectToc={selectToc}
          onReturnToProgress={returnToProgress}
          onStartNewConversation={startNewConversation}
          onToggleToc={() => {
            const nextOpen = !compactTocOpen;
            if (nextOpen) changeActivePanel(null);
            setCompactTocOpen(nextOpen);
          }}
          onUpdatePreferences={setPreferences}
        />
      )}
    </main>
  );
}

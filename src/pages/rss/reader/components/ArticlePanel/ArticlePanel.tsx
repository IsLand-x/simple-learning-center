import { Allotment } from 'allotment';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { clamp } from '../../../../../util/format';
import { useWorkspace } from '../../store/WorkspaceContext';
import { RssActivityRail } from '../AssistantPanel/RssActivityRail';
import { RssRightPanel } from '../AssistantPanel/RssRightPanel';
import { ArticleContent } from './ArticleContent';
import { RssArticleToc } from './RssArticleToc';
import { RssDetailToolbar } from './RssDetailToolbar';

export function ArticlePanel() {
  const persistedFeeds = useLearningStore((state) => state.rssFeeds);
  const persistedReaderPreferences = useLearningStore((state) => state.readerPreferences);
  const persistedSetReaderPreferences = useLearningStore((state) => state.setReaderPreferences);
  const { article, tasks, navigation: workspace } = useWorkspace();

  const setRssPanelWidth = useLearningStore((state) => state.setRssPanelWidth);
  const updateRssItem = useLearningStore((state) => state.updateRssItem);
  const rssPanelWidth = useLearningStore((state) => state.rssPanelWidth);
  const selectedItemDetailStatus = workspace.selectedItem
    ? workspace.isSelectedVideo
      ? workspace.selectedItem.readAt
        ? '已读 · 视频'
        : '未读 · 视频'
      : `${workspace.selectedItem.readAt ? '已读' : '未读'} · ${tasks.summaryStatus === 'ready' ? 'AI 已总结' : tasks.summaryStatus === 'generating' ? 'AI 总结中' : '等待摘要'}`
    : '未选择内容';
  const translationActionLabel = article.translationVisible
    ? '显示原文'
    : workspace.hasSelectedTranslation
      ? '显示中文翻译'
      : workspace.isSelectedVideo
        ? article.sanitizedContentHtml
          ? '翻译视频简介'
          : '没有可翻译的视频简介'
        : '翻译当前页面';

  return (
    <section className="rss-detail-layout w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]">
      <Allotment
        className="rss-detail-allotment min-w-0 min-h-0"
        proportionalLayout={false}
        separator={Boolean(workspace.activePanel)}
        onDragEnd={(sizes) => {
          if (workspace.activePanel && sizes[1])
            setRssPanelWidth(clamp(sizes[1], workspace.compactLayout ? 280 : 320, 720));
        }}
      >
        <Allotment.Pane minSize={0}>
          <div className="rss-detail-pane w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]">
            <RssDetailToolbar
              articleFetching={Boolean(
                workspace.selectedItem && article.fetchingArticleIds.has(workspace.selectedItem.id),
              )}
              digest={workspace.selectedDigest}
              digestGenerating={tasks.digestGenerating}
              feed={workspace.selectedFeed}
              hasContent={Boolean(article.sanitizedContentHtml)}
              isVideo={workspace.isSelectedVideo}
              item={workspace.selectedItem}
              itemStatus={selectedItemDetailStatus}
              query={workspace.query}
              readerPreferences={persistedReaderPreferences}
              showScrolledTitle={article.showScrolledTitle}
              stylePopoverVisible={article.stylePopoverVisible}
              todayKey={workspace.todayKey}
              translationActionLabel={translationActionLabel}
              translationGenerating={tasks.translationStatus === 'generating'}
              translationVisible={article.translationVisible}
              videoImporting={article.videoImporting}
              onChangeReaderPreferences={persistedSetReaderPreferences}
              onFetchArticle={(item) => void article.fetchArticleContent(item)}
              onImportVideo={() => void article.importSelectedYouTubeVideo()}
              onOpenDigestSettings={() => workspace.setDigestSettingsVisible(true)}
              onOpenOriginal={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
              onRegenerateDigest={(date) => void tasks.runDigest(date)}
              onStylePopoverVisibleChange={article.setStylePopoverVisible}
              onToggleBookmark={(item) =>
                updateRssItem(item.id, {
                  bookmarkedAt: item.bookmarkedAt ? undefined : Date.now(),
                })
              }
              onTranslate={() => void tasks.translateCurrentPage()}
            />
            <div className="rss-article-workspace relative min-w-0 min-h-0 overflow-hidden [container-name:rss-article-workspace] [container-type:inline-size]">
              <RssArticleToc
                activeHeadingId={article.activeHeadingId}
                headings={article.displayedArticleHeadings}
                style={article.articleTocStyle}
                onSelect={article.jumpToHeading}
              />
              <ArticleContent />
            </div>
          </div>
        </Allotment.Pane>
        <Allotment.Pane
          visible={Boolean(workspace.activePanel)}
          preferredSize={rssPanelWidth}
          minSize={workspace.compactLayout ? 280 : 320}
          maxSize={720}
        >
          {workspace.activePanel && (
            <RssRightPanel
              activePanel={workspace.activePanel}
              annotations={article.selectedAnnotations}
              item={workspace.selectedItem}
              items={workspace.filteredItems}
              feeds={persistedFeeds}
              query={workspace.query}
              selectedText={article.aiQuote}
              onClearSelectedText={article.clearAiQuote}
              onJumpAnnotation={article.jumpToAnnotation}
            />
          )}
        </Allotment.Pane>
      </Allotment>

      {workspace.selectedItem && (
        <RssActivityRail
          activePanel={workspace.activePanel}
          onChange={(panel) =>
            workspace.setActivePanel((current) => (current === panel ? null : panel))
          }
        />
      )}
    </section>
  );
}

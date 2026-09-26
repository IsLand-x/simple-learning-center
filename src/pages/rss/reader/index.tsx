import {
  IconColorPalette,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons';
import { Button, Empty, Input, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { Allotment } from 'allotment';
import { ReaderSelectionOverlays } from '../../../components/reading/ReaderSelectionOverlays';
import { ReaderStylePanel } from '../../../components/reading/ReaderStylePanel';
import { clamp } from '../../../util/format';
import { RssActivityRail } from './components/RssActivityRail';
import { RssAddSourceDialog } from './components/RssAddSourceDialog';
import { RssArticleToc } from './components/RssArticleToc';
import { RssCreateFolderDialog } from './components/RssCreateFolderDialog';
import { RssDetailToolbar } from './components/RssDetailToolbar';
import { RssDigestArticle } from './components/RssDigestArticle';
import { RssDigestSettingsSheet } from './components/RssDigestSettingsSheet';
import { RssImageViewer } from './components/RssImageViewer';
import { RssItemArticle } from './components/RssItemArticle';
import { RssItemContextMenu } from './components/RssItemContextMenu';
import { RssItemList } from './components/RssItemList';
import { RssItemListHeaderActions } from './components/RssItemListHeaderActions';
import { RssManageSourcesSheet } from './components/RssManageSourcesSheet';
import { RssMobileDetailActions } from './components/RssMobileDetailActions';
import { RssMobileWorkspace } from './components/RssMobileWorkspace';
import { RssRightPanel } from './components/RssRightPanel';
import { RssSourceActions } from './components/RssSourceActions';
import { RssSourceContextMenu } from './components/RssSourceContextMenu';
import { RssSourceTree } from './components/RssSourceTree';
import { digestDateLabel } from './store/model/rssPageModel';
import { exportOpml } from './store/rssOpml';
import { useRssPageStore } from './store/useRssPageStore';

const { Text, Title } = Typography;

export function RssPage() {
  const page = useRssPageStore();

  const sourceActions = (
    <RssSourceActions
      feeds={page.feeds}
      folders={page.folders}
      visible={page.sourceActionsVisible}
      onExport={exportOpml}
      onImport={() => page.opmlInputRef.current?.click()}
      onManage={() => page.setManageVisible(true)}
      onMarkAllRead={() => page.markRssItemsRead()}
      onRefreshAll={() => void page.refreshFeeds(page.feeds)}
      onVisibleChange={page.setSourceActionsVisible}
    />
  );

  const sourceListContent = (
    <RssSourceTree
      dailyDigestCount={page.dailyDigests.length}
      expandedFolders={page.expandedFolders}
      folderFeeds={page.folderFeeds}
      folders={page.folders}
      itemCount={page.items.length}
      refreshingIds={page.refreshingIds}
      selectedFeedId={page.selectedFeedId}
      totalBookmarked={page.totalBookmarked}
      totalUnread={page.totalUnread}
      unfiledFeeds={page.unfiledFeeds}
      unreadByFeed={page.unreadByFeed}
      onChangeExpandedFolders={page.setExpandedFolders}
      onClearItemMenu={() => page.setItemMenu(null)}
      onCreateFolder={() => page.setFolderVisible(true)}
      onDragStart={page.handleSourceDragStart}
      onDragUpdate={page.handleSourceDragUpdate}
      onDragEnd={page.handleSourceDragEnd}
      onOpenSourceMenu={(feed, x, y) => page.setSourceMenu({ feed, x, y })}
      onSelectSource={page.selectSource}
    />
  );

  const itemsContent = (
    <RssItemList
      dailyDigests={page.digestList}
      feeds={page.feeds}
      filteredItems={page.filteredItems}
      query={page.query}
      searchPreviews={page.searchPreviews}
      selectedDigestId={page.selectedDigest?.id}
      selectedFeedId={page.selectedFeedId}
      selectedItemId={page.selectedItem?.id}
      timeRange={page.timeRange}
      todayItemsCount={page.todayItems.length}
      todayKey={page.todayKey}
      onOpenDigest={page.openDigest}
      onOpenItem={page.openItem}
      onOpenItemMenu={(item, x, y) => {
        page.setSourceMenu(null);
        page.setItemMenu({ item, x, y });
      }}
      onSelectRange={page.selectRange}
    />
  );

  const selectedItemDetailStatus = page.selectedItem
    ? page.isSelectedVideo
      ? page.selectedItem.readAt
        ? '已读 · 视频'
        : '未读 · 视频'
      : `${page.selectedItem.readAt ? '已读' : '未读'} · ${page.summaryStatus === 'ready' ? 'AI 已总结' : page.summaryStatus === 'generating' ? 'AI 总结中' : '等待摘要'}`
    : '未选择内容';
  const translationActionLabel = page.translationVisible
    ? '显示原文'
    : page.hasSelectedTranslation
      ? '显示中文翻译'
      : page.isSelectedVideo
        ? page.sanitizedContentHtml
          ? '翻译视频简介'
          : '没有可翻译的视频简介'
        : '翻译当前页面';

  const selectedDigest = page.selectedDigest;
  const articleContent = selectedDigest ? (
    <RssDigestArticle
      date={selectedDigest.date}
      digest={selectedDigest.content ? selectedDigest : undefined}
      error={page.digestError}
      feeds={page.feeds}
      generating={page.digestGenerating}
      items={page.items}
      style={page.articleStyle}
      onGenerate={() => void page.runDigest(selectedDigest.date)}
    />
  ) : page.selectedItem ? (
    <RssItemArticle
      articleBodyRef={page.articleBodyRef}
      articleRef={page.articleRef}
      hasTranslation={page.hasSelectedTranslation}
      isVideo={page.isSelectedVideo}
      item={page.selectedItem}
      query={page.query}
      sanitizedContentHtml={page.sanitizedContentHtml}
      sanitizedContentMarkup={page.sanitizedContentMarkup}
      sanitizedTranslationHtml={page.sanitizedTranslationHtml}
      sanitizedTranslationMarkup={page.sanitizedTranslationMarkup}
      source={page.selectedFeed}
      style={page.articleStyle}
      summaryError={page.summaryError}
      summaryStatus={page.summaryStatus}
      translationError={page.translationError}
      translationStatus={page.translationStatus}
      translationVisible={page.translationVisible}
      videoPresentation={page.selectedVideoPresentation}
      onContentClick={page.handleArticleContentClick}
      onContentKeyDown={page.handleArticleContentKeyDown}
      onScroll={(event) => {
        page.markAutomaticallySelectedItemRead(event.currentTarget);
        page.setRssSelection(null);
        page.setActiveAnnotationTarget(null);
        page.syncActiveHeading(event.currentTarget);
        const title = event.currentTarget.querySelector<HTMLElement>('.rss-article__title');
        if (!title) return;
        page.setShowScrolledTitle(
          title.offsetTop + title.offsetHeight <= event.currentTarget.scrollTop + 12,
        );
      }}
    />
  ) : (
    <div className="rss-article-empty min-w-0 min-h-0 justify-center [padding:24px] [background:var(--semi-color-bg-0)]">
      <Empty title="选择一条订阅内容" description="内容详情、收藏和 AI 摘要会显示在这里" />
    </div>
  );

  return (
    <main className="rss-page w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)] mobile:[padding-bottom:0]">
      {page.mobileLayout ? (
        <RssMobileWorkspace
          activePanel={page.mobilePanel}
          articleFetching={Boolean(
            page.selectedItem && page.fetchingArticleIds.has(page.selectedItem.id),
          )}
          bookmarked={Boolean(page.selectedItem?.bookmarkedAt)}
          canFetchArticle={Boolean(page.selectedItem?.link && !page.isSelectedVideo)}
          detailContent={articleContent}
          detailActions={
            page.selectedDigest || page.selectedItem ? (
              <RssMobileDetailActions
                articleFetching={Boolean(
                  page.selectedItem && page.fetchingArticleIds.has(page.selectedItem.id),
                )}
                digest={page.selectedDigest}
                digestGenerating={page.digestGenerating}
                feed={page.selectedFeed}
                hasContent={Boolean(page.sanitizedContentHtml)}
                isVideo={page.isSelectedVideo}
                item={page.selectedItem}
                translationActionLabel={translationActionLabel}
                translationGenerating={page.translationStatus === 'generating'}
                translationVisible={page.translationVisible}
                videoImporting={page.videoImporting}
                onFetchArticle={(item) => void page.fetchArticleContent(item)}
                onImportVideo={() => void page.importSelectedYouTubeVideo()}
                onOpenDigestSettings={() => page.setDigestSettingsVisible(true)}
                onOpenOriginal={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                onRegenerateDigest={(date) => void page.runDigest(date)}
                onToggleBookmark={(item) =>
                  page.updateRssItem(item.id, {
                    bookmarkedAt: item.bookmarkedAt ? undefined : Date.now(),
                  })
                }
                onTranslate={() => void page.translateCurrentPage()}
              />
            ) : undefined
          }
          detailIsDigest={Boolean(page.selectedDigest)}
          detailStatus={
            page.selectedDigest
              ? `${page.selectedDigest.date === page.todayKey ? '[正在产出中] ' : ''}${page.selectedDigest.itemCount} 条内容`
              : selectedItemDetailStatus
          }
          detailTitle={
            page.selectedDigest
              ? `${digestDateLabel(page.selectedDigest.date)}日报`
              : page.selectedItem?.title
          }
          hasOriginalLink={Boolean(page.selectedItem?.link)}
          hasNextItem={Boolean(page.nextItem)}
          hasPreviousItem={Boolean(page.previousItem)}
          itemCount={
            page.selectedFeedId === 'daily' ? page.digestList.length : page.filteredItems.length
          }
          itemCountUnit={page.selectedFeedId === 'daily' ? '天' : '条内容'}
          itemsContent={itemsContent}
          itemsActions={
            page.selectedFeedId === 'daily' ? (
              <>
                <Button
                  aria-label="立即更新今天的日报"
                  icon={<IconRefresh />}
                  loading={page.digestGenerating}
                  theme="borderless"
                  type="tertiary"
                  onClick={() => void page.runDigest(page.todayKey)}
                />
                <Button
                  aria-label="打开日报设置"
                  icon={<IconSetting />}
                  theme="borderless"
                  type="tertiary"
                  onClick={() => page.setDigestSettingsVisible(true)}
                />
              </>
            ) : undefined
          }
          panelContent={
            page.mobilePanel === 'style' ? (
              <aside
                className="right-panel w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-1)] min-w-0 [max-width:none] mobile-style-panel rss-mobile-style-panel"
                aria-label="阅读样式"
              >
                <div className="panel-titlebar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
                  <div className="panel-titlebar__title min-w-0 [color:var(--semi-color-text-1)]">
                    <IconColorPalette size="large" className="panel-tool-icon" />
                    <Text strong>阅读样式</Text>
                  </div>
                </div>
                <div className="mobile-style-panel__body mobile:min-h-0 mobile:overflow-auto rss-mobile-style-panel__body mobile:min-h-0 mobile:overflow-auto">
                  <ReaderStylePanel
                    preferences={page.readerPreferences}
                    onChangePreferences={page.setReaderPreferences}
                  />
                </div>
              </aside>
            ) : page.mobilePanel ? (
              <RssRightPanel
                activePanel={page.mobilePanel}
                item={page.selectedItem}
                items={page.filteredItems}
                feeds={page.feeds}
                query={page.query}
                selectedText={page.aiQuote}
                onClearSelectedText={page.clearAiQuote}
              />
            ) : null
          }
          query={page.query}
          sourceActions={sourceActions}
          sourceTitle={page.selectedSourceTitle}
          sourcesContent={sourceListContent}
          totalUnread={page.totalUnread}
          unreadVisibleCount={page.unreadVisibleItems.length}
          view={page.mobileView}
          onAddSource={() => page.setAddVisible(true)}
          onBackToItems={page.showMobileItems}
          onBackToSources={page.showMobileSources}
          onChangePanel={page.changeMobilePanel}
          onChangeQuery={(value) => {
            page.setQuery(value);
            page.setSelectedItemId(null);
          }}
          onFetchArticle={() => {
            if (page.selectedItem) void page.fetchArticleContent(page.selectedItem);
          }}
          onMarkVisibleRead={() =>
            page.markRssItemsRead(page.unreadVisibleItems.map((item) => item.id))
          }
          onOpenNextItem={() => {
            if (page.nextItem) page.openItem(page.nextItem);
          }}
          onOpenOriginal={() => {
            if (page.selectedItem?.link)
              window.open(page.selectedItem.link, '_blank', 'noopener,noreferrer');
          }}
          onOpenPreviousItem={() => {
            if (page.previousItem) page.openItem(page.previousItem);
          }}
          onToggleBookmark={() => {
            if (page.selectedItem)
              page.updateRssItem(page.selectedItem.id, {
                bookmarkedAt: page.selectedItem.bookmarkedAt ? undefined : Date.now(),
              });
          }}
        />
      ) : (
        <>
          <header className="rss-page__header [min-height:52px] [padding:0_14px_0_16px] [background:var(--semi-color-bg-1)]">
            <div className="rss-page__heading [min-width:170px] [align-items:baseline]">
              <Title heading={5}>RSS</Title>
              <Text size="small" type="tertiary">
                {page.totalUnread} 条未读
              </Text>
            </div>
            <Input
              aria-label="搜索订阅内容"
              prefix={<IconSearch />}
              placeholder="搜索订阅内容"
              showClear
              value={page.query}
              onChange={(value) => {
                page.setQuery(value);
                page.setSelectedItemId(null);
              }}
              className="rss-search-input [width:min(320px,_32vw)] [margin-left:auto] [@media(max-width:560px)]:[width:140px]"
            />
          </header>

          <div className="rss-page__workspace min-w-0 min-h-0 overflow-hidden">
            <Allotment className="rss-allotment w-full" separator vertical={page.compactLayout}>
              <Allotment.Pane
                minSize={page.compactLayout ? 120 : 160}
                preferredSize={page.compactLayout ? 180 : 220}
                maxSize={page.compactLayout ? 240 : 340}
              >
                <section
                  className="rss-source-pane w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]"
                  aria-label="订阅源"
                >
                  <div className="rss-panel-header [min-height:44px] [flex:0_0_44px] [padding:0_10px_0_12px] [background:var(--semi-color-bg-1)]">
                    <Text strong>订阅源</Text>
                    {sourceActions}
                    <Tooltip content="添加订阅源">
                      <Button
                        aria-label="添加订阅源"
                        icon={<IconPlus />}
                        size="small"
                        theme="borderless"
                        type="tertiary"
                        onClick={() => page.setAddVisible(true)}
                      />
                    </Tooltip>
                  </div>
                  {sourceListContent}
                </section>
              </Allotment.Pane>

              <Allotment.Pane
                minSize={page.compactLayout ? 160 : 190}
                preferredSize={page.compactLayout ? 220 : 320}
                maxSize={page.compactLayout ? 320 : 520}
              >
                <section
                  className="rss-items-pane w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]"
                  aria-label="订阅内容列表"
                >
                  <div className="rss-panel-header [min-height:44px] [flex:0_0_44px] [padding:0_10px_0_12px] [background:var(--semi-color-bg-1)]">
                    <Text strong ellipsis={{ showTooltip: true }}>
                      {page.selectedSourceTitle}
                    </Text>
                    <Text size="small" type="tertiary">
                      {page.selectedFeedId === 'daily'
                        ? `${page.digestList.length} 天`
                        : `${page.filteredItems.length} 条`}
                    </Text>
                    <RssItemListHeaderActions
                      daily={page.selectedFeedId === 'daily'}
                      digestGenerating={page.digestGenerating}
                      todayKey={page.todayKey}
                      unreadItemIds={page.unreadVisibleItems.map((item) => item.id)}
                      onGenerateDigest={(date) => void page.runDigest(date)}
                      onMarkRead={page.markRssItemsRead}
                      onOpenDigestSettings={() => page.setDigestSettingsVisible(true)}
                    />
                  </div>
                  {itemsContent}
                </section>
              </Allotment.Pane>

              <Allotment.Pane minSize={page.compactLayout ? 240 : 300}>
                <section className="rss-detail-layout w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]">
                  <Allotment
                    className="rss-detail-allotment min-w-0 min-h-0"
                    proportionalLayout={false}
                    separator={Boolean(page.activePanel)}
                    onDragEnd={(sizes) => {
                      if (page.activePanel && sizes[1])
                        page.setRssPanelWidth(clamp(sizes[1], page.compactLayout ? 280 : 320, 720));
                    }}
                  >
                    <Allotment.Pane minSize={0}>
                      <div className="rss-detail-pane w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]">
                        <RssDetailToolbar
                          articleFetching={Boolean(
                            page.selectedItem && page.fetchingArticleIds.has(page.selectedItem.id),
                          )}
                          digest={page.selectedDigest}
                          digestGenerating={page.digestGenerating}
                          feed={page.selectedFeed}
                          hasContent={Boolean(page.sanitizedContentHtml)}
                          isVideo={page.isSelectedVideo}
                          item={page.selectedItem}
                          itemStatus={selectedItemDetailStatus}
                          query={page.query}
                          readerPreferences={page.readerPreferences}
                          showScrolledTitle={page.showScrolledTitle}
                          stylePopoverVisible={page.stylePopoverVisible}
                          todayKey={page.todayKey}
                          translationActionLabel={translationActionLabel}
                          translationGenerating={page.translationStatus === 'generating'}
                          translationVisible={page.translationVisible}
                          videoImporting={page.videoImporting}
                          onChangeReaderPreferences={page.setReaderPreferences}
                          onFetchArticle={(item) => void page.fetchArticleContent(item)}
                          onImportVideo={() => void page.importSelectedYouTubeVideo()}
                          onOpenDigestSettings={() => page.setDigestSettingsVisible(true)}
                          onOpenOriginal={(url) =>
                            window.open(url, '_blank', 'noopener,noreferrer')
                          }
                          onRegenerateDigest={(date) => void page.runDigest(date)}
                          onStylePopoverVisibleChange={page.setStylePopoverVisible}
                          onToggleBookmark={(item) =>
                            page.updateRssItem(item.id, {
                              bookmarkedAt: item.bookmarkedAt ? undefined : Date.now(),
                            })
                          }
                          onTranslate={() => void page.translateCurrentPage()}
                        />
                        <div className="rss-article-workspace relative min-w-0 min-h-0 overflow-hidden [container-name:rss-article-workspace] [container-type:inline-size]">
                          <RssArticleToc
                            activeHeadingId={page.activeHeadingId}
                            headings={page.displayedArticleHeadings}
                            style={page.articleTocStyle}
                            onSelect={page.jumpToHeading}
                          />
                          {articleContent}
                        </div>
                      </div>
                    </Allotment.Pane>
                    <Allotment.Pane
                      visible={Boolean(page.activePanel)}
                      preferredSize={page.rssPanelWidth}
                      minSize={page.compactLayout ? 280 : 320}
                      maxSize={720}
                    >
                      {page.activePanel && (
                        <RssRightPanel
                          activePanel={page.activePanel}
                          annotations={page.selectedAnnotations}
                          item={page.selectedItem}
                          items={page.filteredItems}
                          feeds={page.feeds}
                          query={page.query}
                          selectedText={page.aiQuote}
                          onClearSelectedText={page.clearAiQuote}
                          onJumpAnnotation={page.jumpToAnnotation}
                        />
                      )}
                    </Allotment.Pane>
                  </Allotment>

                  {page.selectedItem && (
                    <RssActivityRail
                      activePanel={page.activePanel}
                      onChange={(panel) =>
                        page.setActivePanel((current) => (current === panel ? null : panel))
                      }
                    />
                  )}
                </section>
              </Allotment.Pane>
            </Allotment>
          </div>
        </>
      )}

      <input
        ref={page.opmlInputRef}
        className="visually-hidden"
        type="file"
        accept=".opml,.xml,text/xml"
        onChange={(event) => void page.importOpml(event)}
      />

      <RssDigestSettingsSheet
        configs={page.configs}
        runs={page.digestRuns}
        settings={page.digestSettings}
        visible={page.digestSettingsVisible}
        onCancel={() => page.setDigestSettingsVisible(false)}
        onSave={(settings) => {
          page.setRssDigestSettings(settings);
          page.setDigestSettingsVisible(false);
          Toast.success(settings.enabled ? '日报定时任务已开启' : '日报设置已保存');
        }}
      />

      <RssAddSourceDialog
        feedFolderId={page.feedFolderId}
        feedTitle={page.feedTitle}
        feedType={page.feedType}
        feedUrl={page.feedUrl}
        folders={page.folders}
        sourceKind={page.sourceKind}
        submitting={page.submitting}
        visible={page.addVisible}
        onCancel={() => page.setAddVisible(false)}
        onChangeFeedFolderId={page.setFeedFolderId}
        onChangeFeedTitle={page.setFeedTitle}
        onChangeFeedType={page.setFeedType}
        onChangeFeedUrl={page.setFeedUrl}
        onChangeSourceKind={(kind) => {
          page.setSourceKind(kind);
          page.setFeedUrl('');
        }}
        onSubmit={(event) => void page.addSubscription(event)}
      />

      <RssCreateFolderDialog
        folderName={page.folderName}
        visible={page.folderVisible}
        onCancel={() => page.setFolderVisible(false)}
        onChangeFolderName={page.setFolderName}
        onSubmit={page.createFolder}
      />

      <RssManageSourcesSheet
        feeds={page.feeds}
        folders={page.folders}
        mobileLayout={page.mobileLayout}
        visible={page.manageVisible}
        onChangeFeedFolder={(feed, folderId) => page.updateRssFeed(feed.id, { folderId })}
        onChangeFeedType={(feed, type) => page.updateRssFeed(feed.id, { type })}
        onClose={() => page.setManageVisible(false)}
        onCreateFolder={() => {
          page.setManageVisible(false);
          page.setFolderVisible(true);
        }}
        onDeleteFeed={page.confirmDeleteFeed}
        onDeleteFolder={page.confirmDeleteFolder}
        onRenameFolder={(folder, name) => page.updateRssFolder(folder.id, { name })}
        onToggleFullContent={(feed, checked) =>
          page.updateRssFeed(feed.id, { fetchFullContent: checked })
        }
      />

      <RssImageViewer image={page.imageViewer} onClose={() => page.setImageViewer(null)} />

      <ReaderSelectionOverlays
        activeHighlight={page.activeAnnotation}
        activeHighlightTarget={page.activeAnnotationTarget}
        commentDraft={page.commentDraft}
        commentingHighlightId={page.commentingAnnotationId}
        pendingCommentSelection={page.pendingCommentSelection}
        selection={page.rssSelection}
        showViewHighlight={false}
        onAskAboutSelection={page.askAboutRssSelection}
        onCancelCommentEditing={page.cancelCommentEditing}
        onCancelHighlight={page.deleteActiveAnnotation}
        onChangeCommentDraft={page.setCommentDraft}
        onCreateComment={page.createRssComment}
        onEditHighlightComment={page.editAnnotationComment}
        onSaveHighlight={page.saveRssHighlight}
        onSaveHighlightComment={page.saveRssComment}
        onViewHighlight={() => undefined}
      />

      <RssSourceContextMenu
        items={page.items}
        menu={page.sourceMenu}
        onClose={() => page.setSourceMenu(null)}
        onDelete={page.confirmDeleteFeed}
        onManage={() => page.setManageVisible(true)}
        onMarkRead={page.markRssItemsRead}
        onRefresh={(feed) => void page.refreshFeed(feed)}
      />

      <RssItemContextMenu
        menu={page.itemMenu}
        onClose={() => page.setItemMenu(null)}
        onMarkRead={(item) => page.markRssItemsRead([item.id])}
        onMarkUnread={(item) => page.markRssItemsUnread([item.id])}
        onToggleBookmark={(item) =>
          page.updateRssItem(item.id, {
            bookmarkedAt: item.bookmarkedAt ? undefined : Date.now(),
          })
        }
      />
    </main>
  );
}

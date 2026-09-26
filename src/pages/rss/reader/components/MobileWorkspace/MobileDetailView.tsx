import {
  IconBookmark,
  IconChevronLeft,
  IconChevronRight,
  IconExternalOpen,
  IconGlobeStroked,
  IconMore,
} from '@douyinfe/semi-icons';
import { Button, Typography } from '@douyinfe/semi-ui';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { ArticleContent } from '../ArticlePanel/ArticleContent';
import { RssMobileDetailActions } from '../ArticlePanel/RssMobileDetailActions';
import { digestDateLabel } from '../rssFormat';
const { Text } = Typography;

export function MobileDetailView() {
  const { article, tasks, navigation: workspace } = useWorkspace();

  const updateRssItem = useLearningStore((state) => state.updateRssItem);
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
  const activePanel = workspace.mobilePanel;
  const articleFetching = Boolean(
    workspace.selectedItem && article.fetchingArticleIds.has(workspace.selectedItem.id),
  );
  const bookmarked = Boolean(workspace.selectedItem?.bookmarkedAt);
  const canFetchArticle = Boolean(workspace.selectedItem?.link && !workspace.isSelectedVideo);
  const detailContent = <ArticleContent />;
  const detailActions =
    workspace.selectedDigest || workspace.selectedItem ? (
      <RssMobileDetailActions
        articleFetching={Boolean(
          workspace.selectedItem && article.fetchingArticleIds.has(workspace.selectedItem.id),
        )}
        digest={workspace.selectedDigest}
        digestGenerating={tasks.digestGenerating}
        feed={workspace.selectedFeed}
        hasContent={Boolean(article.sanitizedContentHtml)}
        isVideo={workspace.isSelectedVideo}
        item={workspace.selectedItem}
        translationActionLabel={translationActionLabel}
        translationGenerating={tasks.translationStatus === 'generating'}
        translationVisible={article.translationVisible}
        videoImporting={article.videoImporting}
        onFetchArticle={(item) => void article.fetchArticleContent(item)}
        onImportVideo={() => void article.importSelectedYouTubeVideo()}
        onOpenDigestSettings={() => workspace.setDigestSettingsVisible(true)}
        onOpenOriginal={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
        onRegenerateDigest={(date) => void tasks.runDigest(date)}
        onToggleBookmark={(item) =>
          updateRssItem(item.id, {
            bookmarkedAt: item.bookmarkedAt ? undefined : Date.now(),
          })
        }
        onTranslate={() => void tasks.translateCurrentPage()}
      />
    ) : undefined;
  const detailIsDigest = Boolean(workspace.selectedDigest);
  const detailStatus = workspace.selectedDigest
    ? `${workspace.selectedDigest.date === workspace.todayKey ? '[正在产出中] ' : ''}${workspace.selectedDigest.itemCount} 条内容`
    : selectedItemDetailStatus;
  const detailTitle = workspace.selectedDigest
    ? `${digestDateLabel(workspace.selectedDigest.date)}日报`
    : workspace.selectedItem?.title;
  const hasOriginalLink = Boolean(workspace.selectedItem?.link);
  const hasNextItem = Boolean(workspace.nextItem);
  const hasPreviousItem = Boolean(workspace.previousItem);
  const onBackToItems = workspace.showMobileItems;
  const onChangePanel = workspace.changeMobilePanel;
  const onFetchArticle = () => {
    if (workspace.selectedItem) void article.fetchArticleContent(workspace.selectedItem);
  };
  const onOpenNextItem = () => {
    if (workspace.nextItem) workspace.openItem(workspace.nextItem);
  };
  const onOpenOriginal = () => {
    if (workspace.selectedItem?.link)
      window.open(workspace.selectedItem.link, '_blank', 'noopener,noreferrer');
  };
  const onOpenPreviousItem = () => {
    if (workspace.previousItem) workspace.openItem(workspace.previousItem);
  };
  const onToggleBookmark = () => {
    if (workspace.selectedItem)
      updateRssItem(workspace.selectedItem.id, {
        bookmarkedAt: workspace.selectedItem.bookmarkedAt ? undefined : Date.now(),
      });
  };
  return (
    <section
      className="rss-mobile-screen mobile:h-full mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden mobile:[background:var(--semi-color-bg-0)] rss-mobile-screen--detail"
      aria-label="订阅内容详情"
    >
      <header className="rss-mobile-topbar mobile:[min-height:58px] mobile:[flex:0_0_58px] mobile:[padding:0_max(8px,_env(safe-area-inset-right))_0_max(8px,_env(safe-area-inset-left))] mobile:[border-bottom:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)] rss-mobile-topbar--detail">
        <Button
          className="rss-mobile-topbar__back"
          aria-label={activePanel ? '关闭更多阅读工具' : '返回订阅内容列表'}
          icon={<IconChevronLeft />}
          theme="borderless"
          type="tertiary"
          onClick={() => (activePanel ? onChangePanel(null) : onBackToItems())}
        />
        <div className="rss-mobile-topbar__identity mobile:min-w-0 mobile:justify-center mobile:[gap:1px] mobile:[line-height:1.25] rss-mobile-topbar__identity--grow">
          <Text strong ellipsis={{ showTooltip: true }}>
            {detailTitle ?? '订阅内容详情'}
          </Text>
          <Text size="small" type="tertiary">
            {detailStatus}
          </Text>
        </div>
        <div className="rss-mobile-topbar__actions mobile:min-w-0 mobile:[gap:2px] mobile:[margin-left:auto]">
          {detailActions ?? (
            <>
              <Button
                aria-label={bookmarked ? '取消收藏' : '收藏'}
                aria-pressed={bookmarked}
                className={bookmarked ? 'rss-bookmark-button--active' : ''}
                icon={
                  <IconBookmark
                    className={
                      bookmarked ? 'rss-bookmark-icon--filled' : 'rss-bookmark-icon--empty'
                    }
                  />
                }
                theme="borderless"
                type="tertiary"
                onClick={onToggleBookmark}
              />
              <Button
                aria-label="读取原文"
                disabled={!canFetchArticle}
                icon={<IconGlobeStroked />}
                loading={articleFetching}
                theme="borderless"
                type="tertiary"
                onClick={onFetchArticle}
              />
              {hasOriginalLink && (
                <Button
                  aria-label="打开原文"
                  icon={<IconExternalOpen />}
                  theme="borderless"
                  type="tertiary"
                  onClick={onOpenOriginal}
                />
              )}
            </>
          )}
        </div>
      </header>
      <div className="rss-mobile-screen__body mobile:min-w-0 mobile:min-h-0 mobile:overflow-hidden">
        {detailContent}
      </div>
      {!detailIsDigest && (
        <nav
          className="rss-mobile-reader-tools mobile:[height:calc(var(--mobile-reader-toolbar-height,_58px)_+_env(safe-area-inset-bottom))] mobile:[min-height:calc(var(--mobile-reader-toolbar-height,_58px)_+_env(safe-area-inset-bottom))] mobile:[grid-template-columns:repeat(3,_minmax(0,_1fr))] mobile:[flex:0_0_auto] mobile:[padding:4px_max(8px,_env(safe-area-inset-right))_max(4px,_env(safe-area-inset-bottom))_max(8px,_env(safe-area-inset-left))] mobile:[border-top:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)]"
          aria-label="RSS 阅读工具"
        >
          <Button
            aria-label="上一篇订阅内容"
            disabled={!hasPreviousItem}
            icon={<IconChevronLeft />}
            theme="borderless"
            type="tertiary"
            onClick={onOpenPreviousItem}
          >
            上一篇
          </Button>
          <Button
            aria-label="下一篇订阅内容"
            disabled={!hasNextItem}
            icon={<IconChevronRight />}
            theme="borderless"
            type="tertiary"
            onClick={onOpenNextItem}
          >
            下一篇
          </Button>
          <Button
            aria-label={activePanel ? '收起更多阅读工具' : '打开更多阅读工具'}
            aria-pressed={Boolean(activePanel)}
            className={activePanel ? 'rss-mobile-reader-tools__button--active' : ''}
            icon={<IconMore />}
            theme="borderless"
            type="tertiary"
            onClick={() => onChangePanel(activePanel ? null : 'ai')}
          >
            更多
          </Button>
        </nav>
      )}
    </section>
  );
}

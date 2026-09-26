import { Empty } from '@douyinfe/semi-ui';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { RssDigestArticle } from '../DigestPanel/RssDigestArticle';
import { RssItemArticle } from './RssItemArticle';

export function ArticleContent() {
  const persistedFeeds = useLearningStore((state) => state.rssFeeds);
  const persistedItems = useLearningStore((state) => state.rssItems);
  const { article, tasks, navigation: workspace } = useWorkspace();

  const selectedDigest = workspace.selectedDigest;

  return selectedDigest ? (
    <RssDigestArticle
      date={selectedDigest.date}
      digest={selectedDigest.content ? selectedDigest : undefined}
      error={tasks.digestError}
      feeds={persistedFeeds}
      generating={tasks.digestGenerating}
      items={persistedItems}
      style={article.articleStyle}
      onGenerate={() => void tasks.runDigest(selectedDigest.date)}
    />
  ) : workspace.selectedItem ? (
    <RssItemArticle
      articleBodyRef={article.articleBodyRef}
      articleRef={article.articleRef}
      hasTranslation={workspace.hasSelectedTranslation}
      isVideo={workspace.isSelectedVideo}
      item={workspace.selectedItem}
      query={workspace.query}
      sanitizedContentHtml={article.sanitizedContentHtml}
      sanitizedContentMarkup={article.sanitizedContentMarkup}
      sanitizedTranslationHtml={article.sanitizedTranslationHtml}
      sanitizedTranslationMarkup={article.sanitizedTranslationMarkup}
      source={workspace.selectedFeed}
      style={article.articleStyle}
      summaryError={tasks.summaryError}
      summaryStatus={tasks.summaryStatus}
      translationError={tasks.translationError}
      translationStatus={tasks.translationStatus}
      translationVisible={article.translationVisible}
      videoPresentation={workspace.selectedVideoPresentation}
      onContentClick={article.handleArticleContentClick}
      onContentKeyDown={article.handleArticleContentKeyDown}
      onScroll={(event) => {
        workspace.markAutomaticallySelectedItemRead(event.currentTarget);
        article.setRssSelection(null);
        article.setActiveAnnotationTarget(null);
        article.syncActiveHeading(event.currentTarget);
        const title = event.currentTarget.querySelector<HTMLElement>('.rss-article__title');
        if (!title) return;
        article.setShowScrolledTitle(
          title.offsetTop + title.offsetHeight <= event.currentTarget.scrollTop + 12,
        );
      }}
    />
  ) : (
    <div className="rss-article-empty min-w-0 min-h-0 justify-center [padding:24px] [background:var(--semi-color-bg-0)]">
      <Empty title="选择一条订阅内容" description="内容详情、收藏和 AI 摘要会显示在这里" />
    </div>
  );
}

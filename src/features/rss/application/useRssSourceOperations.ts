import {
  useCallback,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { Toast } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../lib/confirmDialog';
import {
  fetchRssArticle,
  fetchRssSource,
  fetchedItemsForFeed,
  resolveRssSource,
  type RssSourceInput,
} from '../../../lib/rssApi';
import { ServerApiError } from '../../../lib/serverApi';
import { createUuid } from '../../../lib/uuid';
import { useLearningStore } from '../../../store/useLearningStore';
import type { RssFeed, RssFeedType, RssFolder, RssItem, RssSourceErrorCode } from '../../../types';
import { normalizedFeed, rssSourceKey, type RssSourceKind } from '../model/rssPageModel';

const RSS_AUTO_ARTICLE_FETCH_LIMIT = 6;

export function useRssSourceOperations({
  feeds,
  folders,
  selectedItemIdRef,
  setExpandedFolders,
  setSelectedFeedId,
  onCloseAddDialog,
  onCloseFolderDialog,
}: {
  feeds: RssFeed[];
  folders: RssFolder[];
  selectedItemIdRef: MutableRefObject<string | null>;
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>;
  setSelectedFeedId: (sourceId: string) => void;
  onCloseAddDialog: () => void;
  onCloseFolderDialog: () => void;
}) {
  const addRssFolder = useLearningStore((state) => state.addRssFolder);
  const deleteRssFolder = useLearningStore((state) => state.deleteRssFolder);
  const upsertRssFeed = useLearningStore((state) => state.upsertRssFeed);
  const updateRssFeed = useLearningStore((state) => state.updateRssFeed);
  const deleteRssFeed = useLearningStore((state) => state.deleteRssFeed);
  const mergeRssItems = useLearningStore((state) => state.mergeRssItems);
  const updateRssItem = useLearningStore((state) => state.updateRssItem);
  const [sourceKind, setSourceKind] = useState<RssSourceKind>('rss');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedTitle, setFeedTitle] = useState('');
  const [feedType, setFeedType] = useState<RssFeedType>('article');
  const [feedFolderId, setFeedFolderId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [fetchingArticleIds, setFetchingArticleIds] = useState<Set<string>>(new Set());

  const refreshFeed = useCallback(
    async (feed: RssFeed) => {
      setRefreshingIds((current) => new Set(current).add(feed.id));
      try {
        const result = await fetchRssSource(feed.source);
        const fetchedItems = fetchedItemsForFeed(feed.id, result);
        if (feed.fetchFullContent) {
          const existingItems = new Map(
            useLearningStore
              .getState()
              .rssItems.filter((item) => item.feedId === feed.id)
              .map((item) => [item.id, item]),
          );
          const candidates = fetchedItems
            .filter((item) => item.link && !existingItems.get(item.id)?.fullContentFetchedAt)
            .slice(0, RSS_AUTO_ARTICLE_FETCH_LIMIT);
          for (const item of candidates) {
            try {
              const article = await fetchRssArticle(item.link);
              Object.assign(item, {
                fullContentHtml: article.contentHtml,
                fullContentText: article.contentText,
                fullContentUrl: article.url || item.link,
                fullContentFetchedAt: article.fetchedAt,
                fullContentError: undefined,
              });
            } catch (error) {
              item.fullContentError = error instanceof Error ? error.message : '原文抓取失败';
            }
          }
        }
        mergeRssItems(feed.id, fetchedItems);
        updateRssFeed(feed.id, {
          title: feed.title || result.title,
          url: result.feedUrl,
          siteUrl: result.siteUrl || feed.siteUrl,
          description: result.description || feed.description,
          lastFetchedAt: result.fetchedAt,
          lastSuccessAt: result.fetchedAt,
          lastError: undefined,
          lastErrorCode: undefined,
        });
        return true;
      } catch (error) {
        updateRssFeed(feed.id, {
          lastError: error instanceof Error ? error.message : '刷新失败',
          lastErrorCode:
            error instanceof ServerApiError
              ? (error.code as RssSourceErrorCode | undefined)
              : undefined,
        });
        return false;
      } finally {
        setRefreshingIds((current) => {
          const next = new Set(current);
          next.delete(feed.id);
          return next;
        });
      }
    },
    [mergeRssItems, updateRssFeed],
  );

  const fetchArticleContent = useCallback(
    async (item: RssItem) => {
      if (!item.link) {
        Toast.warning('这条内容没有可抓取的原文链接');
        return false;
      }
      setFetchingArticleIds((current) => new Set(current).add(item.id));
      try {
        const article = await fetchRssArticle(item.link);
        updateRssItem(item.id, {
          fullContentHtml: article.contentHtml,
          fullContentText: article.contentText,
          fullContentUrl: article.url || item.link,
          fullContentFetchedAt: article.fetchedAt,
          fullContentError: undefined,
          aiSummary: undefined,
          aiSummaryUpdatedAt: undefined,
          aiSummaryVersion: undefined,
          aiTranslation: undefined,
          aiTranslationHtml: undefined,
          aiTranslationUpdatedAt: undefined,
          aiTranslationSourceFetchedAt: undefined,
        });
        if (selectedItemIdRef.current === item.id) {
          Toast.success(item.fullContentFetchedAt ? '原文已重新抓取' : '原文已抓取');
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : '原文抓取失败';
        updateRssItem(item.id, { fullContentError: message });
        if (selectedItemIdRef.current === item.id) Toast.error(message);
        return false;
      } finally {
        setFetchingArticleIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    },
    [selectedItemIdRef, updateRssItem],
  );

  const refreshFeeds = useCallback(
    async (targets: RssFeed[], notify = true) => {
      if (!targets.length) {
        if (notify) Toast.info('还没有订阅源');
        return;
      }
      let failed = 0;
      for (const feed of targets) {
        if (!(await refreshFeed(feed))) failed += 1;
      }
      if (!notify) return;
      if (failed) Toast.warning(`${targets.length - failed} 个订阅源已刷新，${failed} 个失败`);
      else Toast.success('订阅源已刷新');
    },
    [refreshFeed],
  );

  const addSubscription = async (event: FormEvent) => {
    event.preventDefault();
    const input = feedUrl.trim();
    if (sourceKind !== 'bilibili-weekly' && !input) return;
    setSubmitting(true);
    try {
      const request: RssSourceInput =
        sourceKind === 'bilibili-weekly'
          ? { kind: sourceKind }
          : ({ kind: sourceKind, input } as RssSourceInput);
      const { source, result } = await resolveRssSource(request);
      const duplicate = feeds.find((feed) => rssSourceKey(feed.source) === rssSourceKey(source));
      if (duplicate) {
        Toast.warning('这个订阅源已经存在');
        setSelectedFeedId(duplicate.id);
        onCloseAddDialog();
        return;
      }
      const id = createUuid();
      const type = source.kind === 'rss' ? feedType : 'video';
      const feed = normalizedFeed(id, type, feedFolderId || undefined, result, source, feedTitle);
      upsertRssFeed(feed);
      mergeRssItems(id, fetchedItemsForFeed(id, result));
      setSelectedFeedId(id);
      onCloseAddDialog();
      setFeedUrl('');
      setFeedTitle('');
      setSourceKind('rss');
      Toast.success(`已订阅“${feed.title}”`);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '添加订阅源失败');
    } finally {
      setSubmitting(false);
    }
  };

  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    if (folders.some((folder) => folder.name === name)) {
      Toast.warning('同名文件夹已经存在');
      return;
    }
    const timestamp = Date.now();
    const folder = { id: createUuid(), name, createdAt: timestamp, updatedAt: timestamp };
    addRssFolder(folder);
    setFeedFolderId(folder.id);
    setExpandedFolders((current) => new Set(current).add(folder.id));
    setFolderName('');
    onCloseFolderDialog();
  };

  const confirmDeleteFeed = (feed: RssFeed) => {
    confirmDialog({
      title: `删除“${feed.title}”？`,
      content: '会删除服务器数据目录中的订阅配置、该订阅源的内容、收藏和相关 AI 对话。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        deleteRssFeed(feed.id);
        Toast.success('订阅源已删除');
      },
    });
  };

  const confirmDeleteFolder = (folder: RssFolder) => {
    const childCount = feeds.filter((feed) => feed.folderId === folder.id).length;
    confirmDialog({
      title: `删除文件夹“${folder.name}”？`,
      content:
        childCount > 0
          ? `文件夹中的 ${childCount} 个订阅源会移到“未分类”，订阅内容不会被删除。`
          : '只会删除这个空文件夹。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        deleteRssFolder(folder.id);
        Toast.success('文件夹已删除');
      },
    });
  };

  const importOpml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSubmitting(true);
    try {
      const document = new DOMParser().parseFromString(await file.text(), 'text/xml');
      if (document.querySelector('parsererror')) throw new Error('OPML 文件格式不正确');
      const outlines = Array.from(
        document.querySelectorAll('outline[xmlUrl], outline[learningCenterSourceKind]'),
      ).filter(
        (outline) =>
          outline.hasAttribute('xmlUrl') || outline.hasAttribute('learningCenterSourceKind'),
      );
      let imported = 0;
      let failed = 0;
      for (const outline of outlines) {
        const url = outline.getAttribute('xmlUrl')?.trim() || '';
        const declaredSourceKind = outline.getAttribute('learningCenterSourceKind');
        const sourceKindFromOpml: RssSourceKind =
          declaredSourceKind === 'bilibili-weekly' ||
          declaredSourceKind === 'bilibili-up' ||
          declaredSourceKind === 'youtube-channel'
            ? declaredSourceKind
            : 'rss';
        const sourceInput =
          sourceKindFromOpml === 'bilibili-weekly'
            ? ''
            : sourceKindFromOpml === 'bilibili-up'
              ? outline.getAttribute('learningCenterUid')?.trim() || ''
              : sourceKindFromOpml === 'youtube-channel'
                ? outline.getAttribute('learningCenterChannelId')?.trim() || url
                : url;
        if (sourceKindFromOpml !== 'bilibili-weekly' && !sourceInput) continue;
        let folderNameFromOpml = '';
        let parent = outline.parentElement;
        while (parent && parent.localName === 'outline') {
          if (!parent.getAttribute('xmlUrl')) {
            folderNameFromOpml = parent.getAttribute('text') || parent.getAttribute('title') || '';
            break;
          }
          parent = parent.parentElement;
        }
        let folderId: string | undefined;
        if (folderNameFromOpml) {
          let folder = useLearningStore
            .getState()
            .rssFolders.find((item) => item.name === folderNameFromOpml);
          if (!folder) {
            const timestamp = Date.now();
            folder = {
              id: createUuid(),
              name: folderNameFromOpml,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            useLearningStore.getState().addRssFolder(folder);
          }
          folderId = folder.id;
        }
        const declaredType = outline.getAttribute('learningCenterType');
        const type: RssFeedType =
          declaredType === 'video' || declaredType === 'social' ? declaredType : 'article';
        const fetchFullContent = outline.getAttribute('learningCenterFetchFullContent') === 'true';
        try {
          const request: RssSourceInput =
            sourceKindFromOpml === 'bilibili-weekly'
              ? { kind: sourceKindFromOpml }
              : ({ kind: sourceKindFromOpml, input: sourceInput } as RssSourceInput);
          const { source, result } = await resolveRssSource(request);
          if (
            useLearningStore
              .getState()
              .rssFeeds.some((feed) => rssSourceKey(feed.source) === rssSourceKey(source))
          ) {
            continue;
          }
          const id = createUuid();
          const title = outline.getAttribute('title') || outline.getAttribute('text') || undefined;
          useLearningStore
            .getState()
            .upsertRssFeed(
              normalizedFeed(
                id,
                source.kind === 'rss' ? type : 'video',
                folderId,
                result,
                source,
                title,
                source.kind === 'rss' && fetchFullContent,
              ),
            );
          useLearningStore.getState().mergeRssItems(id, fetchedItemsForFeed(id, result));
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed) Toast.warning(`已导入 ${imported} 个订阅源，${failed} 个失败`);
      else Toast.success(`已导入 ${imported} 个订阅源`);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '导入 OPML 失败');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    addSubscription,
    confirmDeleteFeed,
    confirmDeleteFolder,
    createFolder,
    feedFolderId,
    feedTitle,
    feedType,
    feedUrl,
    fetchingArticleIds,
    fetchArticleContent,
    folderName,
    importOpml,
    refreshingIds,
    refreshFeed,
    refreshFeeds,
    setFeedFolderId,
    setFeedTitle,
    setFeedType,
    setFeedUrl,
    setFolderName,
    setSourceKind,
    sourceKind,
    submitting,
  };
}

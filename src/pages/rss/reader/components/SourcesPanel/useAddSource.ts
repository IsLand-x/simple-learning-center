import { Toast } from '@douyinfe/semi-ui';
import { useState, type FormEvent } from 'react';
import { rssApi } from '../../../../../api/rss';
import type { RssSourceInput } from '../../../../../api/rss/type';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { fetchedItemsForFeed } from './feedItems';

import type { RssFeedType } from '../../../../../../contracts/rss';
import { createUuid } from '../../../../../util/uuid';
import { normalizedFeed, rssSourceKey, type RssSourceKind } from './sourceModel';

import { useEffect } from 'react';
export function useAddSource() {
  const feeds = useLearningStore((state) => state.rssFeeds);
  const {
    navigation: { setSelectedFeedId },
    sources: { createdFolderId, setAddVisible, submitting: importing },
  } = useWorkspace();

  const onCloseAddDialog = () => setAddVisible(false);
  const upsertRssFeed = useLearningStore((state) => state.upsertRssFeed);
  const mergeRssItems = useLearningStore((state) => state.mergeRssItems);
  const [sourceKind, setSourceKind] = useState<RssSourceKind>('rss');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedTitle, setFeedTitle] = useState('');
  const [feedType, setFeedType] = useState<RssFeedType>('article');
  const [feedFolderId, setFeedFolderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (createdFolderId) setFeedFolderId(createdFolderId);
  }, [createdFolderId]);
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
      const { source, result } = await rssApi.resolveSource(request);
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

  return {
    feedFolderId,
    feedTitle,
    feedType,
    feedUrl,
    sourceKind,
    submitting: submitting || importing,
    onChangeFeedFolderId: setFeedFolderId,
    onChangeFeedTitle: setFeedTitle,
    onChangeFeedType: setFeedType,
    onChangeFeedUrl: setFeedUrl,
    onChangeSourceKind: (kind: RssSourceKind) => {
      setSourceKind(kind);
      setFeedUrl('');
    },
    onSubmit: addSubscription,
  };
}

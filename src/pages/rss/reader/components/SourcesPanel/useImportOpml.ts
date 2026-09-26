import { Toast } from '@douyinfe/semi-ui';
import { useState, type ChangeEvent } from 'react';
import { rssApi } from '../../../../../api/rss';
import type { RssSourceInput } from '../../../../../api/rss/type';
import { fetchedItemsForFeed } from './feedItems';

import type { RssFeedType } from '../../../../../../contracts/rss';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { createUuid } from '../../../../../util/uuid';
import { normalizedFeed, rssSourceKey, type RssSourceKind } from './sourceModel';

export function useImportOpml() {
  const [submitting, setSubmitting] = useState(false);
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
          const { source, result } = await rssApi.resolveSource(request);
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

  return { importOpml, submitting };
}

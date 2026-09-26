import { Button } from '@douyinfe/semi-ui';
import {
  IconBookmark,
  IconExternalOpen,
  IconGlobeStroked,
  IconLanguage,
  IconRefresh,
  IconSetting,
  IconVideo,
} from '@douyinfe/semi-icons';
import type { RssDailyDigest, RssFeed, RssItem } from '../../../../util/types';

export function RssMobileDetailActions({
  articleFetching,
  digest,
  digestGenerating,
  feed,
  hasContent,
  isVideo,
  item,
  translationActionLabel,
  translationGenerating,
  translationVisible,
  videoImporting,
  onFetchArticle,
  onImportVideo,
  onOpenDigestSettings,
  onOpenOriginal,
  onRegenerateDigest,
  onToggleBookmark,
  onTranslate,
}: {
  articleFetching: boolean;
  digest?: RssDailyDigest;
  digestGenerating: boolean;
  feed?: RssFeed;
  hasContent: boolean;
  isVideo: boolean;
  item?: RssItem;
  translationActionLabel: string;
  translationGenerating: boolean;
  translationVisible: boolean;
  videoImporting: boolean;
  onFetchArticle: (item: RssItem) => void;
  onImportVideo: () => void;
  onOpenDigestSettings: () => void;
  onOpenOriginal: (url: string) => void;
  onRegenerateDigest: (date: string) => void;
  onToggleBookmark: (item: RssItem) => void;
  onTranslate: () => void;
}) {
  if (digest) {
    return (
      <>
        <Button
          aria-label="重新生成这份日报"
          icon={<IconRefresh />}
          loading={digestGenerating}
          theme="borderless"
          type="tertiary"
          onClick={() => onRegenerateDigest(digest.date)}
        />
        <Button
          aria-label="打开日报设置"
          icon={<IconSetting />}
          theme="borderless"
          type="tertiary"
          onClick={onOpenDigestSettings}
        />
      </>
    );
  }
  if (!item) return null;
  return (
    <>
      <Button
        aria-label={item.bookmarkedAt ? '取消收藏' : '收藏'}
        aria-pressed={Boolean(item.bookmarkedAt)}
        className={item.bookmarkedAt ? 'rss-bookmark-button--active' : ''}
        icon={
          <IconBookmark
            className={item.bookmarkedAt ? 'rss-bookmark-icon--filled' : 'rss-bookmark-icon--empty'}
          />
        }
        theme="borderless"
        type="tertiary"
        onClick={() => onToggleBookmark(item)}
      />
      {!isVideo && (
        <Button
          aria-label={item.fullContentFetchedAt ? '重新读取原文' : '读取原文'}
          disabled={!item.link}
          icon={<IconGlobeStroked />}
          loading={articleFetching}
          theme="borderless"
          type="tertiary"
          onClick={() => onFetchArticle(item)}
        />
      )}
      <Button
        aria-label={translationActionLabel}
        aria-pressed={translationVisible}
        disabled={Boolean(isVideo && !hasContent)}
        icon={<IconLanguage />}
        loading={translationGenerating}
        theme={translationVisible && !translationGenerating ? 'solid' : 'borderless'}
        type="tertiary"
        onClick={onTranslate}
      />
      {feed?.source.kind === 'youtube-channel' && (
        <Button
          aria-label="添加到视频学习区"
          icon={<IconVideo />}
          loading={videoImporting}
          theme="borderless"
          type="tertiary"
          onClick={onImportVideo}
        />
      )}
      {item.link && (
        <Button
          aria-label="打开原文"
          icon={<IconExternalOpen />}
          theme="borderless"
          type="tertiary"
          onClick={() => onOpenOriginal(item.link)}
        />
      )}
    </>
  );
}

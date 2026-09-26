import { Button, Popover, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconBookmark,
  IconColorPalette,
  IconExternalOpen,
  IconGlobeStroked,
  IconLanguage,
  IconRefresh,
  IconSetting,
  IconVideo,
} from '@douyinfe/semi-icons';
import { ReaderStylePanel } from '../../../../components/reading/ReaderStylePanel';
import { getReaderThemeName } from '../../../../util/reading/readerThemes';
import type { ReaderPreferences, RssDailyDigest, RssFeed, RssItem } from '../../../../util/types';
import { digestDateLabel } from '../store/model/rssPageModel';
import { HighlightedText } from './HighlightedText';

const { Text } = Typography;

export function RssDetailToolbar({
  articleFetching,
  digest,
  digestGenerating,
  feed,
  hasContent,
  isVideo,
  item,
  itemStatus,
  query,
  readerPreferences,
  showScrolledTitle,
  stylePopoverVisible,
  todayKey,
  translationActionLabel,
  translationGenerating,
  translationVisible,
  videoImporting,
  onChangeReaderPreferences,
  onFetchArticle,
  onImportVideo,
  onOpenDigestSettings,
  onOpenOriginal,
  onRegenerateDigest,
  onStylePopoverVisibleChange,
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
  itemStatus: string;
  query: string;
  readerPreferences: ReaderPreferences;
  showScrolledTitle: boolean;
  stylePopoverVisible: boolean;
  todayKey: string;
  translationActionLabel: string;
  translationGenerating: boolean;
  translationVisible: boolean;
  videoImporting: boolean;
  onChangeReaderPreferences: (changes: Partial<ReaderPreferences>) => void;
  onFetchArticle: (item: RssItem) => void;
  onImportVideo: () => void;
  onOpenDigestSettings: () => void;
  onOpenOriginal: (url: string) => void;
  onRegenerateDigest: (date: string) => void;
  onStylePopoverVisibleChange: (visible: boolean) => void;
  onToggleBookmark: (item: RssItem) => void;
  onTranslate: () => void;
}) {
  return (
    <div className="rss-detail-toolbar [min-height:44px] [flex:0_0_44px] [padding:0_10px_0_12px] [background:var(--semi-color-bg-1)]">
      <div
        className={`rss-detail-toolbar__context relative [height:22px] min-w-0 overflow-hidden ${showScrolledTitle ? ' rss-detail-toolbar__context--title-visible' : ''}`}
      >
        <Text
          className="rss-detail-toolbar__status absolute [inset:0] block overflow-hidden [line-height:22px] text-ellipsis [transition:opacity_180ms_ease,_transform_180ms_ease] whitespace-nowrap [opacity:1] [transform:translateY(0)]"
          size="small"
          type="tertiary"
        >
          {digest
            ? `${digest.date === todayKey ? '[正在产出中] ' : ''}${digest.itemCount} 条内容 · ${digest.sourceFeedIds.length} 个来源`
            : itemStatus}
        </Text>
        {(item || digest) && (
          <Text
            className="rss-detail-toolbar__title absolute [inset:0] block overflow-hidden [line-height:22px] text-ellipsis [transition:opacity_180ms_ease,_transform_180ms_ease] whitespace-nowrap [opacity:0] [transform:translateY(8px)]"
            ellipsis
            strong
            title={item?.title ?? `${digestDateLabel(digest!.date)}日报`}
          >
            {item ? (
              <HighlightedText text={item.title} query={query} />
            ) : (
              `${digestDateLabel(digest!.date)}日报`
            )}
          </Text>
        )}
      </div>
      {item && (
        <>
          {!isVideo && (
            <Tooltip content={item.fullContentFetchedAt ? '重新读取原文' : '读取原文'}>
              <Button
                aria-label={item.fullContentFetchedAt ? '重新读取原文' : '读取原文'}
                disabled={!item.link}
                icon={<IconGlobeStroked />}
                loading={articleFetching}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => onFetchArticle(item)}
              />
            </Tooltip>
          )}
          <Tooltip content={translationActionLabel}>
            <Button
              aria-label={translationActionLabel}
              aria-pressed={translationVisible}
              disabled={Boolean(isVideo && !hasContent)}
              icon={<IconLanguage />}
              loading={translationGenerating}
              size="small"
              theme={translationVisible && !translationGenerating ? 'solid' : 'borderless'}
              type="tertiary"
              onClick={onTranslate}
            />
          </Tooltip>
          <Popover
            content={
              <ReaderStylePanel
                preferences={readerPreferences}
                onChangePreferences={onChangeReaderPreferences}
              />
            }
            contentClassName="reader-style-popover"
            position="bottomRight"
            showArrow={false}
            trigger="click"
            visible={stylePopoverVisible}
            onVisibleChange={onStylePopoverVisibleChange}
          >
            <Button
              aria-label={`打开阅读样式设置，当前为${getReaderThemeName(readerPreferences.theme)}`}
              aria-pressed={stylePopoverVisible}
              icon={<IconColorPalette />}
              size="small"
              theme="borderless"
              type="tertiary"
            />
          </Popover>
          <Tooltip content={item.bookmarkedAt ? '取消收藏' : '收藏'}>
            <Button
              aria-label={item.bookmarkedAt ? '取消收藏' : '收藏'}
              aria-pressed={Boolean(item.bookmarkedAt)}
              className={item.bookmarkedAt ? 'rss-bookmark-button--active' : ''}
              icon={
                <IconBookmark
                  className={
                    item.bookmarkedAt ? 'rss-bookmark-icon--filled' : 'rss-bookmark-icon--empty'
                  }
                />
              }
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => onToggleBookmark(item)}
            />
          </Tooltip>
          {feed?.source.kind === 'youtube-channel' && (
            <Tooltip content="添加到视频学习区">
              <Button
                aria-label="添加到视频学习区"
                icon={<IconVideo />}
                loading={videoImporting}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={onImportVideo}
              />
            </Tooltip>
          )}
          {item.link && (
            <Tooltip content="打开原文">
              <Button
                aria-label="打开原文"
                icon={<IconExternalOpen />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => onOpenOriginal(item.link)}
              />
            </Tooltip>
          )}
        </>
      )}
      {digest && (
        <>
          <Tooltip content="重新生成这份日报">
            <Button
              aria-label="重新生成这份日报"
              icon={<IconRefresh />}
              loading={digestGenerating}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => onRegenerateDigest(digest.date)}
            />
          </Tooltip>
          <Tooltip content="日报设置">
            <Button
              aria-label="打开日报设置"
              icon={<IconSetting />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={onOpenDigestSettings}
            />
          </Tooltip>
        </>
      )}
    </div>
  );
}

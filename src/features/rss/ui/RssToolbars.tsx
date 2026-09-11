import { Button, Dropdown, Popover, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconCalendarClock,
  IconCheckList,
  IconColorPalette,
  IconComment,
  IconExport,
  IconExternalOpen,
  IconFolderOpen,
  IconGlobeStroked,
  IconImport,
  IconLanguage,
  IconMore,
  IconRefresh,
  IconSetting,
  IconVideo,
} from '@douyinfe/semi-icons';
import { ActivityRailButton } from '../../../components/ActivityRailButton';
import { ReaderStylePanel } from '../../../components/ReaderToolbar';
import { getReaderThemeName } from '../../../lib/readerThemes';
import type {
  ReaderPreferences,
  RssDailyDigest,
  RssFeed,
  RssFolder,
  RssItem,
} from '../../../types';
import { digestDateLabel, type RssSidePanel } from '../model/rssPageModel';
import { HighlightedText } from './RssPresentation';

const { Text } = Typography;

export function RssSourceActions({
  feeds,
  folders,
  visible,
  onExport,
  onImport,
  onManage,
  onMarkAllRead,
  onRefreshAll,
  onVisibleChange,
}: {
  feeds: RssFeed[];
  folders: RssFolder[];
  visible: boolean;
  onExport: (feeds: RssFeed[], folders: RssFolder[]) => void;
  onImport: () => void;
  onManage: () => void;
  onMarkAllRead: () => void;
  onRefreshAll: () => void;
  onVisibleChange: (visible: boolean) => void;
}) {
  return (
    <Dropdown
      trigger="click"
      visible={visible}
      onVisibleChange={onVisibleChange}
      render={
        <Dropdown.Menu>
          <Dropdown.Item
            icon={<IconRefresh />}
            onClick={() => {
              onVisibleChange(false);
              onRefreshAll();
            }}
          >
            刷新全部订阅
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconCheckList />}
            onClick={() => {
              onVisibleChange(false);
              onMarkAllRead();
            }}
          >
            全部标为已读
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconFolderOpen />}
            onClick={() => {
              onVisibleChange(false);
              onManage();
            }}
          >
            管理订阅源
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item
            icon={<IconImport />}
            onClick={() => {
              onVisibleChange(false);
              onImport();
            }}
          >
            导入 OPML
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconExport />}
            onClick={() => {
              onVisibleChange(false);
              onExport(feeds, folders);
            }}
          >
            导出 OPML
          </Dropdown.Item>
        </Dropdown.Menu>
      }
    >
      <Button
        aria-label="更多 RSS 操作"
        icon={<IconMore />}
        size="small"
        theme="borderless"
        type="tertiary"
      />
    </Dropdown>
  );
}

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

export function RssItemListHeaderActions({
  daily,
  digestGenerating,
  todayKey,
  unreadItemIds,
  onGenerateDigest,
  onMarkRead,
  onOpenDigestSettings,
}: {
  daily: boolean;
  digestGenerating: boolean;
  todayKey: string;
  unreadItemIds: string[];
  onGenerateDigest: (date: string) => void;
  onMarkRead: (itemIds: string[]) => void;
  onOpenDigestSettings: () => void;
}) {
  if (daily) {
    return (
      <>
        <Tooltip content="立即更新今天的日报">
          <Button
            aria-label="立即更新今天的日报"
            icon={<IconRefresh />}
            loading={digestGenerating}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => onGenerateDigest(todayKey)}
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
    );
  }
  return (
    <Tooltip
      content={
        unreadItemIds.length
          ? `将当前列表中的 ${unreadItemIds.length} 条内容设为已读`
          : '当前列表没有未读内容'
      }
    >
      <Button
        aria-label="当前列表一键已读"
        disabled={!unreadItemIds.length}
        icon={<IconCheckList />}
        size="small"
        theme="borderless"
        type="tertiary"
        onClick={() => onMarkRead(unreadItemIds)}
      />
    </Tooltip>
  );
}

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
    <div className="rss-detail-toolbar">
      <div
        className={`rss-detail-toolbar__context${showScrolledTitle ? ' rss-detail-toolbar__context--title-visible' : ''}`}
      >
        <Text className="rss-detail-toolbar__status" size="small" type="tertiary">
          {digest
            ? `${digest.date === todayKey ? '[正在产出中] ' : ''}${digest.itemCount} 条内容 · ${digest.sourceFeedIds.length} 个来源`
            : itemStatus}
        </Text>
        {(item || digest) && (
          <Text
            className="rss-detail-toolbar__title"
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

export function RssActivityRail({
  activePanel,
  onChange,
}: {
  activePanel: RssSidePanel;
  onChange: (panel: Exclude<RssSidePanel, null>) => void;
}) {
  return (
    <nav className="activity-bar" aria-label="RSS 辅助功能">
      <ActivityRailButton
        active={activePanel === 'ai'}
        ariaLabel={activePanel === 'ai' ? '收起 AI 助手' : '打开 AI 助手'}
        icon={<IconAIStrokedLevel1 className="panel-tool-icon" />}
        label="AI"
        tooltip={activePanel === 'ai' ? '收起 AI 助手' : '打开 AI 助手'}
        onClick={() => onChange('ai')}
      />
      <ActivityRailButton
        active={activePanel === 'timeline'}
        ariaLabel={activePanel === 'timeline' ? '收起时间线' : '打开时间线'}
        icon={<IconCalendarClock className="panel-tool-icon" />}
        label="时间线"
        tooltip={activePanel === 'timeline' ? '收起时间线' : '打开时间线'}
        onClick={() => onChange('timeline')}
      />
      <ActivityRailButton
        active={activePanel === 'comments'}
        ariaLabel={activePanel === 'comments' ? '收起评论' : '打开评论'}
        icon={<IconComment className="panel-tool-icon" />}
        label="评论"
        tooltip={activePanel === 'comments' ? '收起评论' : '打开评论'}
        onClick={() => onChange('comments')}
      />
    </nav>
  );
}

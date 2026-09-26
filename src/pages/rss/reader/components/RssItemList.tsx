import { Button, ButtonGroup, Empty } from '@douyinfe/semi-ui';
import { IconBookmark } from '@douyinfe/semi-icons';
import { getRssVideoPresentation } from '../store/rssVideo';
import type { RssDailyDigest, RssFeed, RssItem } from '../../../../util/types';
import {
  digestPreview,
  digestDateLabel,
  feedTypeLabels,
  itemTime,
  type TimeRange,
} from '../store/model/rssPageModel';
import { HighlightedText } from './HighlightedText';
import { FeedTypeIcon } from './FeedTypeIcon';

function createFeedMap(feeds: RssFeed[]) {
  return new Map(feeds.map((feed) => [feed.id, feed]));
}

export function RssItemList({
  dailyDigests,
  feeds,
  filteredItems,
  query,
  searchPreviews,
  selectedDigestId,
  selectedFeedId,
  selectedItemId,
  timeRange,
  todayItemsCount,
  todayKey,
  onOpenDigest,
  onOpenItem,
  onOpenItemMenu,
  onSelectRange,
}: {
  dailyDigests: RssDailyDigest[];
  feeds: RssFeed[];
  filteredItems: RssItem[];
  query: string;
  searchPreviews: Map<string, string>;
  selectedDigestId?: string;
  selectedFeedId: string;
  selectedItemId?: string;
  timeRange: TimeRange;
  todayItemsCount: number;
  todayKey: string;
  onOpenDigest: (digest: RssDailyDigest) => void;
  onOpenItem: (item: RssItem) => void;
  onOpenItemMenu: (item: RssItem, x: number, y: number) => void;
  onSelectRange: (range: TimeRange) => void;
}) {
  const feedById = createFeedMap(feeds);

  if (selectedFeedId === 'daily') {
    return (
      <div className="rss-item-list min-h-0 rss-digest-list">
        {dailyDigests.map((digest) => {
          const isToday = digest.date === todayKey;
          return (
            <button
              className={`rss-item-row w-full [min-height:74px] justify-center [gap:7px] [padding:10px_12px] [color:var(--semi-color-text-0)] [background:transparent] [text-align:left] rss-digest-row${selectedDigestId === digest.id ? ' rss-item-row--active' : ''}`}
              key={digest.id}
              type="button"
              onClick={() => onOpenDigest(digest)}
            >
              <span className="rss-item-row__title [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {isToday ? '[正在产出中] ' : ''}
                {digestDateLabel(digest.date)}日报
              </span>
              <span className="rss-item-row__excerpt [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [color:var(--semi-color-text-2)]">
                {digest.content
                  ? digestPreview(digest.content)
                  : isToday && todayItemsCount
                    ? '等待 AI 整理今天的全部内容'
                    : '这一天还没有可展示的日报'}
              </span>
              <span className="rss-item-row__meta min-w-0 [gap:6px] [color:var(--semi-color-text-2)]">
                <span>
                  {digest.itemCount} 条内容 · {digest.sourceFeedIds.length} 个来源
                </span>
                {digest.updatedAt > 0 && <time>{itemTime(digest.updatedAt)}</time>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="rss-time-filter [min-height:46px] [padding:7px_10px] [background:var(--semi-color-fill-0)]">
        <ButtonGroup aria-label="时间范围">
          <Button
            size="small"
            theme={timeRange === 'today' ? 'solid' : 'borderless'}
            type="tertiary"
            onClick={() => onSelectRange('today')}
          >
            今天
          </Button>
          <Button
            size="small"
            theme={timeRange === 'seven-days' ? 'solid' : 'borderless'}
            type="tertiary"
            onClick={() => onSelectRange('seven-days')}
          >
            7 天
          </Button>
          <Button
            size="small"
            theme={timeRange === 'all' ? 'solid' : 'borderless'}
            type="tertiary"
            onClick={() => onSelectRange('all')}
          >
            全部
          </Button>
        </ButtonGroup>
      </div>
      <div className="rss-item-list min-h-0">
        {filteredItems.length ? (
          filteredItems.map((item) => {
            const feed = feedById.get(item.feedId);
            const searchPreview = searchPreviews.get(item.id);
            const videoPresentation = getRssVideoPresentation(item, feed);
            return (
              <button
                className={`rss-item-row w-full [min-height:74px] justify-center [gap:7px] [padding:10px_12px] [color:var(--semi-color-text-0)] [background:transparent] [text-align:left] ${videoPresentation?.imageUrl ? ' rss-item-row--with-thumbnail' : ''}${selectedItemId === item.id ? ' rss-item-row--active' : ''}${item.readAt ? ' rss-item-row--read' : ''}`}
                key={item.id}
                type="button"
                onClick={() => onOpenItem(item)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onOpenItemMenu(item, event.clientX, event.clientY);
                }}
              >
                {videoPresentation?.imageUrl && (
                  <img
                    alt=""
                    className="rss-item-row__thumbnail [width:clamp(76px,_28%,_96px)] [min-width:76px] [aspect-ratio:16_/_9] [background:var(--semi-color-fill-0)] object-cover"
                    decoding="async"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={videoPresentation.imageUrl}
                  />
                )}
                <span className="rss-item-row__content min-w-0 [gap:7px]">
                  <span className="rss-item-row__title [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    <HighlightedText text={item.title} query={query} />
                  </span>
                  {searchPreview && (
                    <span className="rss-item-row__excerpt [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [color:var(--semi-color-text-2)]">
                      <HighlightedText text={searchPreview} query={query} />
                    </span>
                  )}
                  <span className="rss-item-row__meta min-w-0 [gap:6px] [color:var(--semi-color-text-2)]">
                    <span
                      className="rss-item-row__type-icon [display:inline-grid] [width:16px] [height:16px] [flex:0_0_16px] [place-items:center] [color:var(--semi-color-text-2)]"
                      aria-label={feed ? feedTypeLabels[feed.type] : '内容'}
                    >
                      <FeedTypeIcon type={feed?.type ?? 'article'} />
                    </span>
                    <span>
                      <HighlightedText text={feed?.title ?? '未知订阅源'} query={query} />
                    </span>
                    <time>{itemTime(item.publishedAt)}</time>
                    {item.bookmarkedAt && <IconBookmark />}
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <Empty
            title="没有符合条件的内容"
            description={
              feeds.length ? '尝试切换时间范围或搜索词' : '先添加一个 RSS 或 Atom 订阅源'
            }
          />
        )}
      </div>
    </>
  );
}

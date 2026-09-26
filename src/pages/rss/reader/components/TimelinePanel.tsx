import { useMemo } from 'react';
import { Empty, Typography } from '@douyinfe/semi-ui';
import type { RssFeed, RssItem } from '../../../../types/domain';
import { itemTime } from '../store/model/rssPageModel';
import { HighlightedText } from './HighlightedText';

const { Text } = Typography;

export function TimelinePanel({
  items,
  feeds,
  query,
}: {
  items: RssItem[];
  feeds: RssFeed[];
  query: string;
}) {
  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds]);
  const bookmarked = items.filter((item) => item.bookmarkedAt).length;
  const unread = items.filter((item) => !item.readAt).length;
  return (
    <div className="right-panel__body min-h-0 rss-timeline-panel min-h-0">
      <div className="rss-timeline-summary [gap:4px] [margin:12px] [padding:12px] [background:var(--semi-color-fill-0)]">
        <Text strong>范围内共 {items.length} 条更新</Text>
        <Text size="small" type="tertiary">
          {unread} 条未读 · {bookmarked} 条已收藏
        </Text>
      </div>
      <div className="rss-timeline-list min-h-0 [padding:0_14px_20px]">
        {items.length ? (
          items.slice(0, 60).map((item) => (
            <div
              className="rss-timeline-item relative [grid-template-columns:44px_minmax(0,_1fr)] [padding:7px_0_17px]"
              key={item.id}
            >
              <time>{itemTime(item.publishedAt)}</time>
              <div>
                <Text strong>
                  <HighlightedText text={item.title} query={query} />
                </Text>
                <Text size="small" type="tertiary">
                  <HighlightedText
                    text={feedById.get(item.feedId)?.title ?? '未知订阅源'}
                    query={query}
                  />
                </Text>
              </div>
            </div>
          ))
        ) : (
          <Empty title="这个时间范围没有内容" />
        )}
      </div>
    </div>
  );
}

import { type CSSProperties } from 'react';
import { Button, Empty, Spin, Typography } from '@douyinfe/semi-ui';
import { IconAIStrokedLevel1, IconInbox } from '@douyinfe/semi-icons';
import { CspSafeMarkdown } from '../../../../components/ai/CspSafeChatContent';
import type { RssDailyDigest, RssFeed, RssItem } from '../../../../util/types';
import { digestDateLabel, itemDateTime, itemTime, localDateKey } from '../store/model/rssPageModel';

const { Text, Title } = Typography;

export function RssDigestArticle({
  date,
  digest,
  feeds,
  items,
  generating,
  error,
  style,
  onGenerate,
}: {
  date: string;
  digest?: RssDailyDigest;
  feeds: RssFeed[];
  items: RssItem[];
  generating: boolean;
  error: string;
  style: CSSProperties;
  onGenerate: () => void;
}) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const feedById = new Map(feeds.map((feed) => [feed.id, feed]));
  const sources = (digest?.sourceItemIds ?? []).flatMap((itemId) => {
    const item = itemById.get(itemId);
    if (!item) return [];
    return [{ item, feed: feedById.get(item.feedId) }];
  });
  return (
    <article
      className="rss-article min-h-0 w-full min-w-0 [padding:28px_clamp(20px,_5vw,_64px)_56px] [overscroll-behavior-x:none] [transition:color_180ms_ease,_background-color_180ms_ease] [word-break:break-word] rss-digest-article"
      style={style}
    >
      <div className="rss-article__inner [max-width:820px] [margin-inline:auto] rss-digest-article__inner">
        <header className="rss-article__header w-full [max-width:760px] [margin-inline:auto]">
          <div className="rss-article__masthead min-w-0 justify-between [gap:16px] [padding:8px_0_7px] [border-top:3px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_86%,_transparent)] [border-bottom:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_28%,_transparent)] [color:var(--rss-reader-muted-color)] [letter-spacing:0.1em]">
            <span>每日汇编</span>
            <span>AI 整理 · {digest?.itemCount ?? 0} 条内容</span>
          </div>
          <Title className="rss-article__title" heading={3}>
            {digestDateLabel(date)} RSS 日报
          </Title>
          <div className="rss-article__byline [min-height:28px] [padding-bottom:16px] [border-bottom:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_20%,_transparent)]">
            <Text size="small" type="tertiary">
              {date === localDateKey()
                ? '[正在产出中] 今天的内容会随定时任务持续更新'
                : '已归档日报'}
              {digest?.updatedAt && (
                <>
                  {' '}
                  · 更新于 <time>{itemDateTime(digest.updatedAt)}</time>
                </>
              )}
            </Text>
          </div>
        </header>
        {generating && (
          <div
            className="rss-digest-status [min-height:72px] [margin:22px_0] [padding:14px_16px] [background:var(--rss-reader-callout-color)]"
            aria-live="polite"
          >
            <Spin size="small" />
            <Text size="small" type="tertiary">
              正在读取当天全部内容、合并来源并去重…
            </Text>
          </div>
        )}
        {error && (
          <div className="rss-digest-status [min-height:72px] [margin:22px_0] [padding:14px_16px] [background:var(--rss-reader-callout-color)]">
            <Text size="small" type="danger">
              {error}
            </Text>
          </div>
        )}
        {digest?.content ? (
          <CspSafeMarkdown
            className="rss-digest-markdown [color:var(--rss-reader-text-color)] [max-width:720px] [margin:28px_auto_0]"
            content={digest.content}
          />
        ) : !generating ? (
          <Empty title="这一天还没有日报" description="生成后会在这里显示按主题去重的摘要与来源">
            <Button
              icon={<IconAIStrokedLevel1 />}
              theme="solid"
              type="primary"
              onClick={onGenerate}
            >
              立即生成
            </Button>
          </Empty>
        ) : null}
        {sources.length > 0 && (
          <section
            className="rss-digest-sources [max-width:720px] [margin:32px_auto_0]"
            aria-label="日报来源"
          >
            <div className="rss-digest-sources__heading [margin-bottom:18px] [padding:9px_0_8px] [border-top:2px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_74%,_transparent)] [border-bottom:1px_solid_color-mix(in_srgb,_var(--rss-reader-text-color)_20%,_transparent)] [color:var(--rss-reader-accent-color)] [letter-spacing:0.06em]">
              <IconInbox />
              <Text strong>来源</Text>
            </div>
            <div className="rss-digest-sources__list [gap:4px]">
              {sources.map(({ item, feed }) => (
                <a href={item.link} key={item.id} rel="noreferrer" target="_blank">
                  <span>{item.title}</span>
                  <small>
                    {feed?.title ?? '未知订阅源'} · {itemTime(item.publishedAt)}
                  </small>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

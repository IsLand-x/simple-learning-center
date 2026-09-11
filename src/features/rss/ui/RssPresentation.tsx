import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react';
import { Button, ButtonGroup, Empty, Modal, Spin, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconCalendarClock,
  IconComment,
  IconInbox,
  IconLanguage,
  IconMinus,
  IconPlus,
  IconRefresh,
} from '@douyinfe/semi-icons';
import { RssAiPanel } from '../../../components/RssAiPanel';
import { CspSafeMarkdown } from '../../../components/CspSafeChatContent';
import { clamp, formatRelativeTime } from '../../../lib/format';
import { findRssSearchMatches, type RssContentHeading } from '../../../lib/rssContent';
import type { RssVideoPresentation } from '../../../lib/rssVideo';
import type { RssAnnotation, RssDailyDigest, RssFeed, RssItem } from '../../../types';
import {
  digestDateLabel,
  feedTypeLabels,
  itemDateTime,
  itemTime,
  localDateKey,
  type RssImageViewerImage,
  type RssSidePanel,
} from '../model/rssPageModel';

const { Text, Title } = Typography;
const rssImageViewerBodyStyle = { padding: 0 };

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const matches = findRssSearchMatches(text, query);
  if (!matches.length) return <>{text}</>;
  const content: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match) => {
    if (match.start > cursor) content.push(text.slice(cursor, match.start));
    content.push(
      <mark className="rss-search-highlight" key={`${match.start}-${match.end}`}>
        {text.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  });

  if (cursor < text.length) content.push(text.slice(cursor));
  return <>{content}</>;
}

function TimelinePanel({
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
    <div className="right-panel__body rss-timeline-panel">
      <div className="rss-timeline-summary">
        <Text strong>范围内共 {items.length} 条更新</Text>
        <Text size="small" type="tertiary">
          {unread} 条未读 · {bookmarked} 条已收藏
        </Text>
      </div>
      <div className="rss-timeline-list">
        {items.length ? (
          items.slice(0, 60).map((item) => (
            <div className="rss-timeline-item" key={item.id}>
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
    <article className="rss-article rss-digest-article" style={style}>
      <div className="rss-article__inner rss-digest-article__inner">
        <header className="rss-article__header">
          <div className="rss-article__masthead">
            <span>每日汇编</span>
            <span>AI 整理 · {digest?.itemCount ?? 0} 条内容</span>
          </div>
          <Title className="rss-article__title" heading={3}>
            {digestDateLabel(date)} RSS 日报
          </Title>
          <div className="rss-article__byline">
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
          <div className="rss-digest-status" aria-live="polite">
            <Spin size="small" />
            <Text size="small" type="tertiary">
              正在读取当天全部内容、合并来源并去重…
            </Text>
          </div>
        )}
        {error && (
          <div className="rss-digest-status">
            <Text size="small" type="danger">
              {error}
            </Text>
          </div>
        )}
        {digest?.content ? (
          <CspSafeMarkdown className="rss-digest-markdown" content={digest.content} />
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
          <section className="rss-digest-sources" aria-label="日报来源">
            <div className="rss-digest-sources__heading">
              <IconInbox />
              <Text strong>来源</Text>
            </div>
            <div className="rss-digest-sources__list">
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

export function RssItemArticle({
  articleBodyRef,
  articleRef,
  hasTranslation,
  isVideo,
  item,
  query,
  sanitizedContentHtml,
  sanitizedContentMarkup,
  sanitizedTranslationHtml,
  sanitizedTranslationMarkup,
  source,
  style,
  summaryError,
  summaryStatus,
  translationError,
  translationStatus,
  translationVisible,
  videoPresentation,
  onContentClick,
  onContentKeyDown,
  onScroll,
}: {
  articleBodyRef: RefObject<HTMLDivElement>;
  articleRef: RefObject<HTMLElement>;
  hasTranslation: boolean;
  isVideo: boolean;
  item: RssItem;
  query: string;
  sanitizedContentHtml: string;
  sanitizedContentMarkup: { __html: string };
  sanitizedTranslationHtml: string;
  sanitizedTranslationMarkup: { __html: string };
  source?: RssFeed;
  style: CSSProperties;
  summaryError: string;
  summaryStatus: 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';
  translationError: string;
  translationStatus: 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';
  translationVisible: boolean;
  videoPresentation?: RssVideoPresentation;
  onContentClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onContentKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onScroll: (event: ReactUIEvent<HTMLElement>) => void;
}) {
  return (
    <article
      ref={articleRef}
      className={`rss-article${isVideo ? ' rss-article--video' : ''}`}
      style={style}
      onScroll={onScroll}
    >
      <div className="rss-article__inner">
        <header className="rss-article__header">
          <div className="rss-article__masthead">
            <span>
              <HighlightedText text={source?.title ?? '未知订阅源'} query={query} />
            </span>
            <span>{source ? feedTypeLabels[source.type] : '内容'}</span>
          </div>
          <Title className="rss-article__title" heading={3}>
            <HighlightedText text={item.title} query={query} />
          </Title>
          <div className="rss-article__byline">
            <Text size="small" type="tertiary">
              <time>
                {item.publishedAtIsFallback ? '收录于 ' : ''}
                {itemDateTime(item.publishedAt)}
              </time>
              {item.author && (
                <>
                  {' '}
                  · <HighlightedText text={item.author} query={query} />
                </>
              )}
              {item.fullContentFetchedAt && <> · 已读取原文</>}
            </Text>
          </div>
        </header>
        {videoPresentation?.embedUrl && (
          <div className="rss-video-player">
            <iframe
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              src={videoPresentation.embedUrl}
              title={`播放：${item.title}`}
            />
          </div>
        )}
        {isVideo ? (
          <section className="rss-video-description" aria-labelledby="rss-video-description-title">
            <Text id="rss-video-description-title" strong>
              视频简介
            </Text>
            {translationVisible && translationStatus === 'generating' ? (
              <div className="rss-translation-status" aria-live="polite">
                <Spin size="small" />
                <Text type="tertiary">正在翻译视频简介…</Text>
              </div>
            ) : translationVisible && hasTranslation ? (
              sanitizedTranslationHtml ? (
                <div
                  ref={articleBodyRef}
                  className="rss-article__body rss-article__body--rich rss-translation__content"
                  dangerouslySetInnerHTML={sanitizedTranslationMarkup}
                  onClick={onContentClick}
                  onKeyDown={onContentKeyDown}
                />
              ) : (
                <CspSafeMarkdown
                  className="rss-translation__content"
                  content={item.aiTranslation || ''}
                />
              )
            ) : translationVisible && translationStatus === 'error' ? (
              <Text type="danger">{translationError}</Text>
            ) : sanitizedContentHtml ? (
              <div
                ref={articleBodyRef}
                className="rss-article__body rss-article__body--rich"
                dangerouslySetInnerHTML={sanitizedContentMarkup}
                onClick={onContentClick}
                onKeyDown={onContentKeyDown}
              />
            ) : (
              <Text size="small" type="tertiary">
                发布者没有填写视频简介。
              </Text>
            )}
          </section>
        ) : (
          <>
            <section className="rss-ai-summary" aria-live="polite">
              <div className="rss-ai-summary__heading">
                <IconAIStrokedLevel1 />
                <Text strong>AI 导读</Text>
              </div>
              {item.aiSummary && item.aiSummaryVersion === 2 ? (
                <p>{item.aiSummary}</p>
              ) : summaryStatus === 'generating' ? (
                <div className="rss-ai-summary__loading">
                  <Spin size="small" />
                  <Text size="small" type="tertiary">
                    正在阅读并总结当前内容…
                  </Text>
                </div>
              ) : summaryStatus === 'unavailable' ? (
                <Text size="small" type="tertiary">
                  请先在设置页添加并选择模型，进入内容后会自动生成摘要。
                </Text>
              ) : summaryStatus === 'error' ? (
                <Text size="small" type="danger">
                  {summaryError}
                </Text>
              ) : null}
            </section>
            {translationVisible && translationStatus === 'generating' ? (
              <div className="rss-translation-status" aria-live="polite">
                <Spin size="small" />
                <Text type="tertiary">正在翻译当前页面…</Text>
              </div>
            ) : translationVisible && hasTranslation ? (
              <section className="rss-translation" aria-label="当前页面中文翻译">
                <div className="rss-translation__heading">
                  <IconLanguage />
                  <Text strong>中文翻译</Text>
                </div>
                {sanitizedTranslationHtml ? (
                  <div
                    ref={articleBodyRef}
                    className="rss-article__body rss-article__body--rich rss-translation__content"
                    dangerouslySetInnerHTML={sanitizedTranslationMarkup}
                    onClick={onContentClick}
                    onKeyDown={onContentKeyDown}
                  />
                ) : (
                  <CspSafeMarkdown
                    className="rss-translation__content"
                    content={item.aiTranslation || ''}
                  />
                )}
              </section>
            ) : translationVisible && translationStatus === 'error' ? (
              <div className="rss-translation-status">
                <Text type="danger">{translationError}</Text>
              </div>
            ) : sanitizedContentHtml ? (
              <div
                ref={articleBodyRef}
                className="rss-article__body rss-article__body--rich"
                dangerouslySetInnerHTML={sanitizedContentMarkup}
                onClick={onContentClick}
                onKeyDown={onContentKeyDown}
              />
            ) : (
              <Empty
                title="订阅源没有提供正文"
                description="可以打开原文，或让 AI 根据已有摘要和页面链接继续了解"
              />
            )}
          </>
        )}
      </div>
    </article>
  );
}

export function RssArticleToc({
  activeHeadingId,
  headings,
  onSelect,
  style,
}: {
  activeHeadingId?: string;
  headings: RssContentHeading[];
  onSelect: (headingId: string) => void;
  style: CSSProperties;
}) {
  if (!headings.length) return null;
  const minimumLevel = Math.min(...headings.map((heading) => heading.level));
  return (
    <nav className="rss-article-toc" aria-label="文章目录" style={style}>
      <Text className="rss-article-toc__title" size="small" type="tertiary">
        目录
      </Text>
      <div className="rss-article-toc__list">
        {headings.map((heading) => (
          <button
            aria-current={activeHeadingId === heading.id ? 'location' : undefined}
            className={`rss-article-toc__item${activeHeadingId === heading.id ? ' rss-article-toc__item--active' : ''}`}
            key={heading.id}
            style={{ '--rss-toc-depth': heading.level - minimumLevel } as CSSProperties}
            title={heading.text}
            type="button"
            onClick={() => onSelect(heading.id)}
          >
            <span aria-hidden="true" className="rss-article-toc__indicator" />
            <span>{heading.text}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function RssCommentsPanel({
  annotations,
  onJumpAnnotation,
}: {
  annotations: RssAnnotation[];
  onJumpAnnotation: (annotation: RssAnnotation) => void;
}) {
  const comments = annotations
    .filter((annotation) => annotation.comment?.trim())
    .sort(
      (left, right) =>
        (right.commentUpdatedAt ?? right.createdAt) - (left.commentUpdatedAt ?? left.createdAt),
    );
  return (
    <div className="right-panel__body comments-panel rss-comments-panel">
      {comments.length ? (
        comments.map((annotation) => (
          <article
            className="comment-card"
            key={annotation.id}
            role="button"
            tabIndex={0}
            onClick={() => onJumpAnnotation(annotation)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onJumpAnnotation(annotation);
            }}
          >
            <blockquote>{annotation.text}</blockquote>
            <p>{annotation.comment}</p>
            <div className="comment-card__footer">
              <Text size="small" type="tertiary">
                文章评论
              </Text>
              <Text size="small" type="tertiary">
                {formatRelativeTime(annotation.commentUpdatedAt ?? annotation.createdAt)}
              </Text>
            </div>
          </article>
        ))
      ) : (
        <Empty title="还没有评论" description="在正文中选择文字并添加评论后，会集中显示在这里" />
      )}
    </div>
  );
}

export function RssRightPanel({
  activePanel,
  annotations = [],
  item,
  items,
  feeds,
  query,
  selectedText,
  onClearSelectedText,
  onJumpAnnotation = () => undefined,
}: {
  activePanel: Exclude<RssSidePanel, null>;
  annotations?: RssAnnotation[];
  item?: RssItem;
  items: RssItem[];
  feeds: RssFeed[];
  query: string;
  selectedText?: string;
  onClearSelectedText?: () => void;
  onJumpAnnotation?: (annotation: RssAnnotation) => void;
}) {
  const PanelIcon =
    activePanel === 'ai'
      ? IconAIStrokedLevel1
      : activePanel === 'comments'
        ? IconComment
        : IconCalendarClock;
  const title = activePanel === 'ai' ? 'AI 助手' : activePanel === 'comments' ? '评论' : '时间线';
  return (
    <aside
      className={`right-panel${activePanel === 'ai' ? ' right-panel--ai' : ''}`}
      aria-label={title}
    >
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
          <PanelIcon size="large" className="panel-tool-icon" />
          <Text strong>{title}</Text>
        </div>
      </div>
      {activePanel === 'ai' ? (
        item ? (
          <RssAiPanel
            item={item}
            selectedText={selectedText}
            onClearSelectedText={onClearSelectedText}
          />
        ) : (
          <div className="right-panel__body">
            <Empty title="选择一条订阅内容" description="选择内容后即可与 AI 对话" />
          </div>
        )
      ) : activePanel === 'comments' ? (
        item ? (
          <RssCommentsPanel annotations={annotations} onJumpAnnotation={onJumpAnnotation} />
        ) : (
          <div className="right-panel__body">
            <Empty title="选择一条订阅内容" description="文章评论会显示在这里" />
          </div>
        )
      ) : (
        <TimelinePanel items={items} feeds={feeds} query={query} />
      )}
    </aside>
  );
}

type CssVariables = CSSProperties & Record<`--${string}`, string | number>;

export function RssImageViewer({
  image,
  onClose,
}: {
  image: RssImageViewerImage | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setScale(1);
  }, [image?.src]);

  useEffect(() => {
    if (!image) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setScale((current) => clamp(current + 0.25, 0.5, 4));
      }
      if (event.key === '-') {
        event.preventDefault();
        setScale((current) => clamp(current - 0.25, 0.5, 4));
      }
      if (event.key === '0') {
        event.preventDefault();
        setScale(1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [image, onClose]);

  return (
    <Modal
      bodyStyle={rssImageViewerBodyStyle}
      centered
      className="rss-image-viewer"
      closable={false}
      footer={null}
      maskClosable
      visible={Boolean(image)}
      width="min(1120px, calc(100vw - 40px))"
      onCancel={onClose}
    >
      <div className="rss-image-viewer__content" aria-label="图片查看器">
        <div className="rss-image-viewer__toolbar">
          <ButtonGroup aria-label="图片缩放">
            <Tooltip content="缩小（-）">
              <Button
                aria-label="缩小图片"
                disabled={scale <= 0.5}
                icon={<IconMinus />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => setScale((current) => clamp(current - 0.25, 0.5, 4))}
              />
            </Tooltip>
            <Button
              aria-label="恢复图片原始缩放"
              icon={<IconRefresh />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => setScale(1)}
            >
              {Math.round(scale * 100)}%
            </Button>
            <Tooltip content="放大（+）">
              <Button
                aria-label="放大图片"
                disabled={scale >= 4}
                icon={<IconPlus />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => setScale((current) => clamp(current + 0.25, 0.5, 4))}
              />
            </Tooltip>
          </ButtonGroup>
          <Button size="small" theme="borderless" type="tertiary" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="rss-image-viewer__canvas">
          <div
            className="rss-image-viewer__stage"
            style={{ '--rss-image-width': `${scale * 100}%` } as CssVariables}
          >
            {image && (
              <img alt={image.alt} draggable={false} referrerPolicy="no-referrer" src={image.src} />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

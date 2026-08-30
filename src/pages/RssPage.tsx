import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Allotment } from 'allotment';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DragStart,
  type DropResult,
  type DragUpdate,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import {
  Button,
  ButtonGroup,
  Dropdown,
  Empty,
  Input,
  Modal,
  Popover,
  Select,
  SideSheet,
  Spin,
  Switch,
  Toast,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconArticle,
  IconBookmark,
  IconCalendarClock,
  IconCheckList,
  IconChevronDown,
  IconChevronRight,
  IconColorPalette,
  IconComment,
  IconDeleteStroked,
  IconExport,
  IconExternalOpen,
  IconFolderOpen,
  IconGlobeStroked,
  IconImport,
  IconInbox,
  IconLanguage,
  IconMailStroked,
  IconMinus,
  IconMore,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSetting,
  IconVideo,
} from '@douyinfe/semi-icons';
import { RssAiPanel } from '../components/RssAiPanel';
import { CspSafeMarkdown } from '../components/CspSafeChatContent';
import { RssDigestSettingsSheet } from '../components/RssDigestSettingsSheet';
import { ActivityRailButton } from '../components/ActivityRailButton';
import { ReaderSelectionOverlays } from '../components/ReaderSelectionOverlays';
import { ReaderStylePanel } from '../components/ReaderToolbar';
import {
  RssMobileWorkspace,
  type RssMobilePanel,
  type RssMobileView,
} from '../components/RssMobileWorkspace';
import { confirmDialog } from '../lib/confirmDialog';
import { clamp, formatRelativeTime } from '../lib/format';
import { listAiJobs, startAiJob, watchAiJob, getAiJob, type AiJob } from '../lib/aiJobs';
import { fetchRssArticle, fetchRssFeed, fetchedItemsForFeed, generateRssDigest, type FetchedRssFeed } from '../lib/rssApi';
import { extractRssContentHeadings, findRssSearchMatches, sanitizeRssContentHtml, type RssContentHeading } from '../lib/rssContent';
import { ensureReaderFontStylesheet, READER_FONT_STACKS } from '../lib/readerFonts';
import { getReaderTextureStyle, getReaderThemeName, resolveReaderStyle } from '../lib/readerThemes';
import { refreshServerState, waitForServerStateWrites } from '../lib/serverStateStorage';
import { createUuid } from '../lib/uuid';
import { useLearningStore } from '../store/useLearningStore';
import type { ReaderHighlightTarget, ReaderSelection, RssAnnotation, RssDailyDigest, RssFeed, RssFeedType, RssFolder, RssItem } from '../types';

const { Text, Title } = Typography;
type TimeRange = 'today' | 'seven-days' | 'all';
type RssSidePanel = 'ai' | 'timeline' | 'comments' | null;
type SummaryStatus = 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';
type TranslationStatus = 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';

interface RssReaderSelection extends ReaderSelection {
  startOffset: number;
  endOffset: number;
  prefix: string;
  suffix: string;
}

const summaryStartPromises = new Map<string, Promise<AiJob>>();
const translationStartPromises = new Map<string, Promise<AiJob>>();
const rssModalBodyStyle = { paddingBottom: 24 };
const rssImageViewerBodyStyle = { padding: 0 };
const RSS_FOLDER_DRAG_TYPE = 'rss-folder';
const RSS_FEED_DRAG_TYPE = 'rss-feed';
const RSS_FOLDER_DROPPABLE_ID = 'rss-folders';
const RSS_UNFILED_DROPPABLE_ID = 'rss-feeds:unfiled';
const RSS_FOLDER_DRAG_PREFIX = 'rss-folder:';
const RSS_FEED_DRAG_PREFIX = 'rss-feed:';
const RSS_FOLDER_FEEDS_PREFIX = 'rss-feeds:folder:';
const RSS_AUTO_ARTICLE_FETCH_LIMIT = 6;
const RSS_SMART_SOURCE_IDS = new Set(['daily', 'all', 'unread', 'bookmarked']);
const feedTypeLabels: Record<RssFeedType, string> = {
  article: '文章',
  video: '视频',
  social: '社交媒体',
};

function isRssMobileView(value: string | null): value is RssMobileView {
  return value === 'sources' || value === 'items' || value === 'detail';
}

function isRssMobilePanel(value: string | null): value is Exclude<RssMobilePanel, null> {
  return value === 'style' || value === 'ai' || value === 'timeline';
}

function HighlightedText({ text, query }: { text: string; query: string }) {
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

function rssItemContentText(item: RssItem) {
  return item.fullContentText || item.contentText;
}

function rssSearchPreview(item: RssItem, query: string) {
  const normalizedContent = rssItemContentText(item).replace(/\s+/g, ' ').trim();
  const [contentMatch] = findRssSearchMatches(normalizedContent, query);
  if (contentMatch) {
    const start = Math.max(0, contentMatch.start - 34);
    const end = Math.min(normalizedContent.length, contentMatch.end + 58);
    return `${start > 0 ? '…' : ''}${normalizedContent.slice(start, end)}${end < normalizedContent.length ? '…' : ''}`;
  }
  if (item.author && findRssSearchMatches(item.author, query).length) return `作者：${item.author}`;
  return '';
}

function folderFeedsDroppableId(folderId: string) {
  return `${RSS_FOLDER_FEEDS_PREFIX}${folderId}`;
}

function folderIdFromFeedsDroppable(droppableId: string) {
  if (droppableId === RSS_UNFILED_DROPPABLE_ID) return undefined;
  if (!droppableId.startsWith(RSS_FOLDER_FEEDS_PREFIX)) return null;
  return droppableId.slice(RSS_FOLDER_FEEDS_PREFIX.length);
}

function isTimeRange(value: string | null): value is TimeRange {
  return value === 'today' || value === 'seven-days' || value === 'all';
}

function FeedTypeIcon({ type }: { type: RssFeedType }) {
  if (type === 'video') return <IconVideo />;
  if (type === 'social') return <IconGlobeStroked />;
  return <IconArticle />;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function localDateKey(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleDateString('en-CA');
}

function digestDateLabel(date: string) {
  const timestamp = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(timestamp)) return date;
  if (date === localDateKey()) return '今天';
  return new Intl.DateTimeFormat('zh-CN', {
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(timestamp);
}

function itemTime(timestamp: number) {
  const date = new Date(timestamp);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat('zh-CN', {
    ...(includeYear ? { year: 'numeric' } : {}),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function itemDateTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function exportOpml(feeds: RssFeed[], folders: RssFolder[]) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const grouped = new Map<string, RssFeed[]>();
  feeds.forEach((feed) => {
    const folder = feed.folderId ? folderById.get(feed.folderId) ?? '' : '';
    grouped.set(folder, [...(grouped.get(folder) ?? []), feed]);
  });
  const outline = (feed: RssFeed) => `      <outline text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" type="rss" xmlUrl="${escapeXml(feed.url)}" htmlUrl="${escapeXml(feed.siteUrl ?? '')}" learningCenterType="${feed.type}" learningCenterFetchFullContent="${feed.fetchFullContent ? 'true' : 'false'}" />`;
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<opml version="2.0">', '  <head><title>个人学习中心 RSS 订阅</title></head>', '  <body>'];
  for (const [folder, items] of grouped) {
    if (folder) {
      lines.push(`    <outline text="${escapeXml(folder)}" title="${escapeXml(folder)}">`);
      lines.push(...items.map(outline));
      lines.push('    </outline>');
    } else {
      lines.push(...items.map(outline));
    }
  }
  lines.push('  </body>', '</opml>', '');
  const blob = new Blob([lines.join('\n')], { type: 'text/x-opml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `learning-center-rss-${new Date().toISOString().slice(0, 10)}.opml`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizedFeed(
  feedId: string,
  type: RssFeedType,
  folderId: string | undefined,
  result: FetchedRssFeed,
  title?: string,
  fetchFullContent = false,
): RssFeed {
  const timestamp = Date.now();
  return {
    id: feedId,
    title: title?.trim() || result.title,
    url: result.feedUrl,
    siteUrl: result.siteUrl || undefined,
    description: result.description || undefined,
    type,
    fetchFullContent,
    ...(folderId ? { folderId } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastFetchedAt: result.fetchedAt,
  };
}

function TimelinePanel({ items, feeds, query }: { items: RssItem[]; feeds: RssFeed[]; query: string }) {
  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds]);
  const bookmarked = items.filter((item) => item.bookmarkedAt).length;
  const unread = items.filter((item) => !item.readAt).length;
  return (
    <div className="right-panel__body rss-timeline-panel">
      <div className="rss-timeline-summary">
        <Text strong>范围内共 {items.length} 条更新</Text>
        <Text size="small" type="tertiary">{unread} 条未读 · {bookmarked} 条已收藏</Text>
      </div>
      <div className="rss-timeline-list">
        {items.length ? items.slice(0, 60).map((item) => (
          <div className="rss-timeline-item" key={item.id}>
            <time>{itemTime(item.publishedAt)}</time>
            <div>
              <Text strong><HighlightedText text={item.title} query={query} /></Text>
              <Text size="small" type="tertiary"><HighlightedText text={feedById.get(item.feedId)?.title ?? '未知订阅源'} query={query} /></Text>
            </div>
          </div>
        )) : <Empty title="这个时间范围没有内容" />}
      </div>
    </div>
  );
}

function RssDigestArticle({
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
        <Text size="small" type="secondary">AI 整理 · {digest?.itemCount ?? 0} 条内容</Text>
        <Title className="rss-article__title" heading={3}>{digestDateLabel(date)} RSS 日报</Title>
        <Text size="small" type="tertiary">
          {date === localDateKey() ? '[正在产出中] 今天的内容会随定时任务持续更新' : '已归档日报'}
          {digest?.updatedAt && <> · 更新于 {itemDateTime(digest.updatedAt)}</>}
        </Text>
        {generating && (
          <div className="rss-digest-status" aria-live="polite">
            <Spin size="small" />
            <Text size="small" type="tertiary">正在读取未读内容、合并来源并去重…</Text>
          </div>
        )}
        {error && <div className="rss-digest-status"><Text size="small" type="danger">{error}</Text></div>}
        {digest?.content ? (
          <CspSafeMarkdown className="rss-digest-markdown" content={digest.content} />
        ) : !generating ? (
          <Empty
            title="这一天还没有日报"
            description="生成后会在这里显示按主题去重的摘要与来源"
          >
            <Button icon={<IconAIStrokedLevel1 />} theme="solid" type="primary" onClick={onGenerate}>立即生成</Button>
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
                  <small>{feed?.title ?? '未知订阅源'} · {itemTime(item.publishedAt)}</small>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

function RssArticleToc({
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
      <Text className="rss-article-toc__title" size="small" type="tertiary">目录</Text>
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
    .sort((left, right) => (right.commentUpdatedAt ?? right.createdAt) - (left.commentUpdatedAt ?? left.createdAt));
  return (
    <div className="right-panel__body comments-panel rss-comments-panel">
      {comments.length ? comments.map((annotation) => (
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
            <Text size="small" type="tertiary">文章评论</Text>
            <Text size="small" type="tertiary">{formatRelativeTime(annotation.commentUpdatedAt ?? annotation.createdAt)}</Text>
          </div>
        </article>
      )) : <Empty title="还没有评论" description="在正文中选择文字并添加评论后，会集中显示在这里" />}
    </div>
  );
}

function RssRightPanel({
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
  const PanelIcon = activePanel === 'ai'
    ? IconAIStrokedLevel1
    : activePanel === 'comments' ? IconComment : IconCalendarClock;
  const title = activePanel === 'ai' ? 'AI 助手' : activePanel === 'comments' ? '评论' : '时间线';
  return (
    <aside className={`right-panel${activePanel === 'ai' ? ' right-panel--ai' : ''}`} aria-label={title}>
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
          <PanelIcon size="large" className="panel-tool-icon" />
          <Text strong>{title}</Text>
        </div>
      </div>
      {activePanel === 'ai'
        ? item ? <RssAiPanel item={item} selectedText={selectedText} onClearSelectedText={onClearSelectedText} /> : <div className="right-panel__body"><Empty title="选择一条订阅内容" description="选择内容后即可与 AI 对话" /></div>
        : activePanel === 'comments'
          ? item ? <RssCommentsPanel annotations={annotations} onJumpAnnotation={onJumpAnnotation} /> : <div className="right-panel__body"><Empty title="选择一条订阅内容" description="文章评论会显示在这里" /></div>
          : <TimelinePanel items={items} feeds={feeds} query={query} />}
    </aside>
  );
}

interface RssImageViewerImage {
  src: string;
  alt: string;
}

type CssVariables = CSSProperties & Record<`--${string}`, string | number>;

function RssImageViewer({
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
              <Button aria-label="缩小图片" disabled={scale <= 0.5} icon={<IconMinus />} size="small" theme="borderless" type="tertiary" onClick={() => setScale((current) => clamp(current - 0.25, 0.5, 4))} />
            </Tooltip>
            <Button aria-label="恢复图片原始缩放" icon={<IconRefresh />} size="small" theme="borderless" type="tertiary" onClick={() => setScale(1)}>{Math.round(scale * 100)}%</Button>
            <Tooltip content="放大（+）">
              <Button aria-label="放大图片" disabled={scale >= 4} icon={<IconPlus />} size="small" theme="borderless" type="tertiary" onClick={() => setScale((current) => clamp(current + 0.25, 0.5, 4))} />
            </Tooltip>
          </ButtonGroup>
          <Button size="small" theme="borderless" type="tertiary" onClick={onClose}>关闭</Button>
        </div>
        <div className="rss-image-viewer__canvas">
          <div className="rss-image-viewer__stage" style={{ '--rss-image-width': `${scale * 100}%` } as CssVariables}>
            {image && <img alt={image.alt} draggable={false} referrerPolicy="no-referrer" src={image.src} />}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function RssPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const folders = useLearningStore((state) => state.rssFolders);
  const feeds = useLearningStore((state) => state.rssFeeds);
  const items = useLearningStore((state) => state.rssItems);
  const annotations = useLearningStore((state) => state.rssAnnotations);
  const dailyDigests = useLearningStore((state) => state.rssDailyDigests);
  const digestRuns = useLearningStore((state) => state.rssDigestRuns);
  const digestSettings = useLearningStore((state) => state.rssDigestSettings);
  const configs = useLearningStore((state) => state.openAIConfigs);
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const readerPreferences = useLearningStore((state) => state.readerPreferences);
  const addRssFolder = useLearningStore((state) => state.addRssFolder);
  const updateRssFolder = useLearningStore((state) => state.updateRssFolder);
  const moveRssFolder = useLearningStore((state) => state.moveRssFolder);
  const deleteRssFolder = useLearningStore((state) => state.deleteRssFolder);
  const upsertRssFeed = useLearningStore((state) => state.upsertRssFeed);
  const updateRssFeed = useLearningStore((state) => state.updateRssFeed);
  const moveRssFeed = useLearningStore((state) => state.moveRssFeed);
  const deleteRssFeed = useLearningStore((state) => state.deleteRssFeed);
  const mergeRssItems = useLearningStore((state) => state.mergeRssItems);
  const updateRssItem = useLearningStore((state) => state.updateRssItem);
  const addRssAnnotation = useLearningStore((state) => state.addRssAnnotation);
  const updateRssAnnotation = useLearningStore((state) => state.updateRssAnnotation);
  const deleteRssAnnotation = useLearningStore((state) => state.deleteRssAnnotation);
  const setRssDigestSettings = useLearningStore((state) => state.setRssDigestSettings);
  const markRssItemsRead = useLearningStore((state) => state.markRssItemsRead);
  const markRssItemsUnread = useLearningStore((state) => state.markRssItemsUnread);
  const rssPanelWidth = useLearningStore((state) => state.rssPanelWidth);
  const setRssPanelWidth = useLearningStore((state) => state.setRssPanelWidth);
  const setReaderPreferences = useLearningStore((state) => state.setReaderPreferences);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(folders.map((folder) => folder.id)));
  const [query, setQuery] = useState('');
  const [activePanel, setActivePanel] = useState<RssSidePanel>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [folderVisible, setFolderVisible] = useState(false);
  const [manageVisible, setManageVisible] = useState(false);
  const [sourceActionsVisible, setSourceActionsVisible] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [feedTitle, setFeedTitle] = useState('');
  const [feedType, setFeedType] = useState<RssFeedType>('article');
  const [feedFolderId, setFeedFolderId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [fetchingArticleIds, setFetchingArticleIds] = useState<Set<string>>(new Set());
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('idle');
  const [summaryError, setSummaryError] = useState('');
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>('idle');
  const [translationError, setTranslationError] = useState('');
  const [translationVisible, setTranslationVisible] = useState(false);
  const [digestSettingsVisible, setDigestSettingsVisible] = useState(false);
  const [digestGenerating, setDigestGenerating] = useState(false);
  const [digestError, setDigestError] = useState('');
  const [sourceMenu, setSourceMenu] = useState<{ feed: RssFeed; x: number; y: number } | null>(null);
  const [itemMenu, setItemMenu] = useState<{ item: RssItem; x: number; y: number } | null>(null);
  const [showScrolledTitle, setShowScrolledTitle] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string>();
  const [stylePopoverVisible, setStylePopoverVisible] = useState(false);
  const [imageViewer, setImageViewer] = useState<RssImageViewerImage | null>(null);
  const [rssSelection, setRssSelection] = useState<RssReaderSelection | null>(null);
  const [pendingCommentSelection, setPendingCommentSelection] = useState<RssReaderSelection | null>(null);
  const [activeAnnotationTarget, setActiveAnnotationTarget] = useState<ReaderHighlightTarget | null>(null);
  const [commentingAnnotationId, setCommentingAnnotationId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [aiQuote, setAiQuote] = useState<string | undefined>();
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const opmlInputRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => setMobileLayout(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setCompactLayout(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let disposed = false;
    let syncing = false;
    const syncScheduledContent = async () => {
      if (disposed || syncing || document.visibilityState === 'hidden') return;
      syncing = true;
      try {
        await refreshServerState();
        if (!disposed) await useLearningStore.persist.rehydrate();
      } catch (error) {
        console.warn('无法同步服务端 RSS 更新', error);
      } finally {
        syncing = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncScheduledContent();
    };
    const timer = window.setInterval(() => void syncScheduledContent(), 60_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds]);
  const unreadByFeed = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (!item.readAt) counts.set(item.feedId, (counts.get(item.feedId) ?? 0) + 1);
    });
    return counts;
  }, [items]);
  const totalUnread = items.filter((item) => !item.readAt).length;
  const totalBookmarked = items.filter((item) => item.bookmarkedAt).length;
  const todayKey = localDateKey();
  const todayItems = items.filter((item) => localDateKey(item.publishedAt) === todayKey);
  const digestList = useMemo(() => {
    const sorted = [...dailyDigests].sort((left, right) => right.date.localeCompare(left.date));
    return sorted.some((digest) => digest.date === todayKey)
      ? sorted
      : [{
        id: `rss-digest:${todayKey}`,
        date: todayKey,
        content: '',
        sourceItemIds: [],
        sourceFeedIds: [],
        itemCount: 0,
        model: '',
        generatedAt: Date.now(),
        updatedAt: 0,
      }, ...sorted];
  }, [dailyDigests, todayKey]);
  const folderFeeds = useMemo(() => new Map(folders.map((folder) => [
    folder.id,
    feeds.filter((feed) => feed.folderId === folder.id),
  ])), [feeds, folders]);
  const unfiledFeeds = feeds.filter((feed) => !feed.folderId || !folders.some((folder) => folder.id === feed.folderId));
  const requestedSourceId = searchParams.get('source') || searchParams.get('feed') || 'all';
  const selectedFeedId = RSS_SMART_SOURCE_IDS.has(requestedSourceId) || feedById.has(requestedSourceId)
    ? requestedSourceId
    : 'all';
  const selectedFeedItems = useMemo(
    () => items.filter((item) => {
      if (selectedFeedId === 'all') return true;
      if (selectedFeedId === 'unread') return !item.readAt;
      if (selectedFeedId === 'bookmarked') return Boolean(item.bookmarkedAt);
      return item.feedId === selectedFeedId;
    }),
    [items, selectedFeedId],
  );
  const requestedTimeRange = searchParams.get('range');
  const defaultTimeRange: TimeRange = selectedFeedItems.some((item) => item.publishedAt >= startOfToday())
    ? 'today'
    : 'seven-days';
  const timeRange: TimeRange = isTimeRange(requestedTimeRange) ? requestedTimeRange : defaultTimeRange;
  const filteredItems = useMemo(() => {
    const today = startOfToday();
    const sevenDaysAgo = today - 6 * 24 * 60 * 60 * 1_000;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return selectedFeedItems
      .filter((item) => {
        if (timeRange === 'today' && item.publishedAt < today) return false;
        if (timeRange === 'seven-days' && item.publishedAt < sevenDaysAgo) return false;
        if (!normalizedQuery) return true;
        const feed = feedById.get(item.feedId);
        return `${item.title} ${item.author ?? ''} ${rssItemContentText(item)} ${feed?.title ?? ''}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => right.publishedAt - left.publishedAt);
  }, [feedById, query, selectedFeedItems, timeRange]);
  const searchPreviews = useMemo(() => new Map(
    query.trim() ? filteredItems.map((item) => [item.id, rssSearchPreview(item, query)]) : [],
  ), [filteredItems, query]);
  const requestedItem = items.find((item) => item.id === searchParams.get('item'));
  const requestedItemMatchesSource = selectedFeedId !== 'daily' && requestedItem && (
    RSS_SMART_SOURCE_IDS.has(selectedFeedId) || requestedItem.feedId === selectedFeedId
  );
  const selectedItem = requestedItemMatchesSource ? requestedItem : mobileLayout ? undefined : filteredItems[0];
  const requestedDigest = digestList.find((digest) => digest.id === searchParams.get('digest'));
  const selectedDigest = selectedFeedId === 'daily'
    ? requestedDigest ?? (mobileLayout ? undefined : digestList[0])
    : undefined;
  const selectedItemId = selectedItem?.id ?? null;
  const selectedItemIndex = selectedItem
    ? filteredItems.findIndex((item) => item.id === selectedItem.id)
    : -1;
  const previousItem = selectedItemIndex > 0 ? filteredItems[selectedItemIndex - 1] : undefined;
  const nextItem = selectedItemIndex >= 0 && selectedItemIndex < filteredItems.length - 1
    ? filteredItems[selectedItemIndex + 1]
    : undefined;
  const selectedFeed = selectedItem ? feedById.get(selectedItem.feedId) : undefined;
  const requestedMobileView = searchParams.get('view');
  const inferredMobileView: RssMobileView = selectedItem || selectedDigest ? 'detail' : 'sources';
  const mobileView: RssMobileView = isRssMobileView(requestedMobileView)
    ? requestedMobileView === 'detail' && !selectedItem && !selectedDigest ? 'items' : requestedMobileView
    : inferredMobileView;
  const requestedMobilePanel = searchParams.get('panel');
  const mobilePanel: RssMobilePanel = mobileLayout
    && mobileView === 'detail'
    && isRssMobilePanel(requestedMobilePanel)
    ? requestedMobilePanel
    : null;
  const selectedAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.itemId === selectedItemId),
    [annotations, selectedItemId],
  );
  const activeAnnotation = activeAnnotationTarget
    ? selectedAnnotations.find((annotation) => annotation.id === activeAnnotationTarget.highlightId)
    : undefined;
  const setSelectedFeedId = useCallback((sourceId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('source', sourceId);
      if (RSS_SMART_SOURCE_IDS.has(sourceId)) next.delete('feed');
      else next.set('feed', sourceId);
      next.delete('item');
      next.delete('digest');
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const setSelectedItemId = useCallback((itemId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('source', selectedFeedId);
      if (itemId) {
        const item = items.find((candidate) => candidate.id === itemId);
        if (item) {
          next.set('feed', item.feedId);
          next.set('item', item.id);
          next.delete('digest');
          return next;
        }
      }
      next.delete('item');
      if (feedById.has(selectedFeedId)) next.set('feed', selectedFeedId);
      else next.delete('feed');
      return next;
    }, { replace: true });
  }, [feedById, items, selectedFeedId, setSearchParams]);
  const setSelectedDigestId = useCallback((digestId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('source', 'daily');
      next.delete('feed');
      next.delete('item');
      if (digestId) next.set('digest', digestId);
      else next.delete('digest');
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const setTimeRange = useCallback((range: TimeRange) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('range', range);
      next.delete('item');
      next.delete('digest');
      if (feedById.has(selectedFeedId)) next.set('feed', selectedFeedId);
      else next.delete('feed');
      return next;
    }, { replace: true });
  }, [feedById, selectedFeedId, setSearchParams]);
  const readerStyle = useMemo(() => resolveReaderStyle(readerPreferences), [readerPreferences]);
  const articleStyle = useMemo(() => ({
    ...getReaderTextureStyle(readerStyle.texture, readerStyle.isDark),
    backgroundColor: readerStyle.paperColor,
    color: readerStyle.textColor,
    fontFamily: READER_FONT_STACKS[readerStyle.fontFamily],
    fontSize: `${readerStyle.fontSize}px`,
    lineHeight: readerStyle.density.lineHeight,
    letterSpacing: readerStyle.density.letterSpacing,
    '--rss-reader-accent-color': readerStyle.accentColor,
    '--rss-reader-callout-color': readerStyle.calloutColor,
    '--rss-reader-muted-color': readerStyle.mutedTextColor,
    '--rss-reader-paragraph-spacing': `${readerStyle.density.paragraphSpacing}em`,
    '--rss-reader-text-color': readerStyle.textColor,
  } as CssVariables), [readerStyle]);
  const articleTocStyle = useMemo(() => ({
    '--rss-toc-accent-color': readerStyle.accentColor,
    '--rss-toc-callout-color': readerStyle.calloutColor,
    '--rss-toc-muted-color': readerStyle.mutedTextColor,
    '--rss-toc-paper-color': readerStyle.paperColor,
    '--rss-toc-text-color': readerStyle.textColor,
  } as CssVariables), [readerStyle]);
  const sanitizedContentHtml = useMemo(() => sanitizeRssContentHtml(
    selectedItem?.fullContentHtml || selectedItem?.contentHtml || selectedItem?.fullContentText || selectedItem?.contentText,
    selectedItem?.fullContentUrl || selectedItem?.link || selectedFeed?.siteUrl || selectedFeed?.url || window.location.href,
    query,
    selectedAnnotations,
  ), [query, selectedAnnotations, selectedFeed?.siteUrl, selectedFeed?.url, selectedItem?.contentHtml, selectedItem?.contentText, selectedItem?.fullContentHtml, selectedItem?.fullContentText, selectedItem?.fullContentUrl, selectedItem?.link]);
  const sanitizedContentMarkup = useMemo(() => ({ __html: sanitizedContentHtml }), [sanitizedContentHtml]);
  const articleHeadings = useMemo(() => extractRssContentHeadings(sanitizedContentHtml), [sanitizedContentHtml]);

  useEffect(() => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      folders.forEach((folder) => next.add(folder.id));
      return next;
    });
  }, [folders]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('source', selectedFeedId);
    next.set('range', timeRange);
    if (selectedFeedId === 'daily' && selectedDigest && (!mobileLayout || mobileView === 'detail')) {
      next.delete('feed');
      next.delete('item');
      next.set('digest', selectedDigest.id);
    } else if (selectedItem && selectedItemId && (!mobileLayout || mobileView === 'detail')) {
      next.set('feed', selectedItem.feedId);
      next.set('item', selectedItemId);
      next.delete('digest');
    } else {
      next.delete('item');
      next.delete('digest');
      if (feedById.has(selectedFeedId)) next.set('feed', selectedFeedId);
      else next.delete('feed');
    }
    if (!mobileLayout || mobileView !== 'detail') next.delete('panel');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [feedById, mobileLayout, mobileView, searchParams, selectedDigest, selectedFeedId, selectedItem, selectedItemId, setSearchParams, timeRange]);

  useEffect(() => {
    setShowScrolledTitle(false);
    setActiveHeadingId(undefined);
    setImageViewer(null);
    setRssSelection(null);
    setPendingCommentSelection(null);
    setActiveAnnotationTarget(null);
    setCommentingAnnotationId(null);
    setCommentDraft('');
    setAiQuote(undefined);
    setTranslationVisible(false);
    setTranslationStatus(selectedItem?.aiTranslation ? 'ready' : 'idle');
    setTranslationError('');
  }, [selectedItem?.id]);

  useLayoutEffect(() => {
    if (!selectedItemId) return;
    const article = articleRef.current;
    if (!article) return;
    article.scrollTop = 0;
    article.scrollLeft = 0;
  }, [selectedItemId]);

  useEffect(() => {
    setActiveHeadingId(articleHeadings[0]?.id);
  }, [articleHeadings, selectedItemId]);

  useEffect(() => {
    const syncSelection = () => {
      const nativeSelection = window.getSelection();
      const body = articleBodyRef.current;
      if (!nativeSelection || nativeSelection.rangeCount !== 1 || nativeSelection.isCollapsed || !body) {
        setRssSelection(null);
        return;
      }
      const range = nativeSelection.getRangeAt(0);
      if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) {
        setRssSelection(null);
        return;
      }
      const rawText = range.toString();
      const text = rawText.trim();
      if (!text) {
        setRssSelection(null);
        return;
      }
      const before = document.createRange();
      before.selectNodeContents(body);
      before.setEnd(range.startContainer, range.startOffset);
      const leadingWhitespace = rawText.length - rawText.trimStart().length;
      const trailingWhitespace = rawText.length - rawText.trimEnd().length;
      const startOffset = before.toString().length + leadingWhitespace;
      const endOffset = startOffset + rawText.length - leadingWhitespace - trailingWhitespace;
      const bodyText = body.textContent ?? '';
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      setActiveAnnotationTarget(null);
      setRssSelection({
        text,
        cfi: `rss:${startOffset}:${endOffset}`,
        startOffset,
        endOffset,
        prefix: bodyText.slice(Math.max(0, startOffset - 32), startOffset),
        suffix: bodyText.slice(endOffset, endOffset + 32),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    };
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [selectedItemId]);

  useEffect(() => {
    void ensureReaderFontStylesheet(document, readerStyle.fontFamily);
  }, [readerStyle.fontFamily]);

  useEffect(() => {
    if (!sourceMenu && !itemMenu) return undefined;
    const close = () => {
      setSourceMenu(null);
      setItemMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.semi-dropdown-menu, .rss-context-menu')) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [itemMenu, sourceMenu]);

  const refreshFeed = useCallback(async (feed: RssFeed) => {
    setRefreshingIds((current) => new Set(current).add(feed.id));
    try {
      const result = await fetchRssFeed(feed.url);
      const fetchedItems = fetchedItemsForFeed(feed.id, result);
      if (feed.fetchFullContent) {
        const existingItems = new Map(
          useLearningStore.getState().rssItems
            .filter((item) => item.feedId === feed.id)
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
        lastError: undefined,
      });
      return true;
    } catch (error) {
      updateRssFeed(feed.id, { lastError: error instanceof Error ? error.message : '刷新失败' });
      return false;
    } finally {
      setRefreshingIds((current) => {
        const next = new Set(current);
        next.delete(feed.id);
        return next;
      });
    }
  }, [mergeRssItems, updateRssFeed]);

  const fetchArticleContent = useCallback(async (item: RssItem) => {
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
        aiTranslationUpdatedAt: undefined,
        aiTranslationSourceFetchedAt: undefined,
      });
      Toast.success(item.fullContentFetchedAt ? '原文已重新抓取' : '原文已抓取');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '原文抓取失败';
      updateRssItem(item.id, { fullContentError: message });
      Toast.error(message);
      return false;
    } finally {
      setFetchingArticleIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }, [updateRssItem]);

  const refreshFeeds = useCallback(async (targets: RssFeed[], notify = true) => {
    if (!targets.length) {
      if (notify) Toast.info('还没有订阅源');
      return;
    }
    let failed = 0;
    for (const feed of targets) {
      if (!await refreshFeed(feed)) failed += 1;
    }
    if (!notify) return;
    if (failed) Toast.warning(`${targets.length - failed} 个订阅源已刷新，${failed} 个失败`);
    else Toast.success('订阅源已刷新');
  }, [refreshFeed]);

  useEffect(() => {
    if (!selectedItem) {
      setSummaryStatus('idle');
      setSummaryError('');
      return undefined;
    }
    if (selectedItem.aiSummary && selectedItem.aiSummaryVersion === 2) {
      setSummaryStatus('ready');
      setSummaryError('');
      return undefined;
    }
    const provider = aiPreferences.provider;
    const config = provider ? configs.find((item) => provider === `api:${item.id}`) : configs[0];
    const model = config?.models.includes(aiPreferences.model) ? aiPreferences.model : config?.models[0];
    if (!config || !model) {
      setSummaryStatus('unavailable');
      return undefined;
    }
    let disposed = false;
    const controller = new AbortController();
    const resourceId = `rss:${selectedItem.id}`;
    const conversationId = `rss-summary-v2:${selectedItem.id}`;
    const applySummaryJob = (job: AiJob) => {
      if (disposed) return;
      if (job.status === 'queued' || job.status === 'running') {
        setSummaryStatus('generating');
        return;
      }
      summaryStartPromises.delete(selectedItem.id);
      if (job.status === 'completed') {
        updateRssItem(selectedItem.id, { aiSummary: job.content, aiSummaryUpdatedAt: Date.now(), aiSummaryVersion: 2 });
        setSummaryStatus('ready');
        setSummaryError('');
      } else if (job.status === 'failed') {
        setSummaryStatus('error');
        setSummaryError(job.error || 'AI 摘要生成失败');
      }
    };
    const monitor = async (job: AiJob) => {
      applySummaryJob(job);
      if (job.status !== 'queued' && job.status !== 'running') return;
      try {
        await watchAiJob(job.id, applySummaryJob, controller.signal);
      } catch (error) {
        if (disposed || (error instanceof Error && error.name === 'AbortError')) return;
        let latest = job;
        while (!disposed && (latest.status === 'queued' || latest.status === 'running')) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          latest = await getAiJob(job.id);
          applySummaryJob(latest);
        }
      }
    };
    const start = async () => {
      setSummaryStatus('generating');
      try {
        const existing = (await listAiJobs(resourceId, conversationId)).find((job) => (
          job.status === 'queued' || job.status === 'running' || job.status === 'completed'
        ));
        let job = existing;
        if (!job) {
          let pending = summaryStartPromises.get(selectedItem.id);
          if (!pending) {
            pending = (async () => {
              await waitForServerStateWrites();
              const createdAt = Date.now();
              return startAiJob({
                configId: config.id,
                model,
                bookId: resourceId,
                resourceType: 'rss',
                rssItemId: selectedItem.id,
                purpose: 'summary',
                conversationId,
                userMessage: {
                  id: createUuid(),
                  content: '请用两到四个完整句子，简要总结这篇文章说了什么，总计不超过 180 个汉字。不要使用标题、列表或 Markdown，不要以省略号结尾，每句话都要完整表达。',
                  createdAt,
                },
                session: { title: `自动摘要：${selectedItem.title}`.slice(0, 100), createdAt },
                currentText: '',
              });
            })();
            summaryStartPromises.set(selectedItem.id, pending);
          }
          job = await pending;
        }
        await monitor(job);
      } catch (error) {
        summaryStartPromises.delete(selectedItem.id);
        if (!disposed) {
          setSummaryStatus('error');
          setSummaryError(error instanceof Error ? error.message : 'AI 摘要生成失败');
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [aiPreferences.model, aiPreferences.provider, configs, selectedItem, updateRssItem]);

  const translateCurrentPage = useCallback(async () => {
    if (!selectedItem) return;
    if (selectedItem.aiTranslation) {
      setTranslationStatus('ready');
      setTranslationVisible((current) => !current);
      return;
    }
    const provider = aiPreferences.provider;
    const config = provider ? configs.find((item) => provider === `api:${item.id}`) : configs[0];
    const model = config?.models.includes(aiPreferences.model) ? aiPreferences.model : config?.models[0];
    if (!config || !model) {
      setTranslationStatus('unavailable');
      setTranslationError('请先在设置页添加并选择模型');
      Toast.warning('请先在设置页添加并选择模型');
      return;
    }
    const resourceId = `rss:${selectedItem.id}`;
    const conversationId = `rss-translation-v1:${selectedItem.id}`;
    setTranslationStatus('generating');
    setTranslationError('');
    setTranslationVisible(true);
    const applyTranslationJob = (job: AiJob) => {
      if (job.status === 'queued' || job.status === 'running') {
        setTranslationStatus('generating');
        return;
      }
      translationStartPromises.delete(selectedItem.id);
      if (job.status === 'completed') {
        updateRssItem(selectedItem.id, {
          aiTranslation: job.content,
          aiTranslationUpdatedAt: Date.now(),
          aiTranslationSourceFetchedAt: Number(selectedItem.fullContentFetchedAt || selectedItem.fetchedAt || 0),
        });
        setTranslationStatus('ready');
        setTranslationError('');
      } else if (job.status === 'failed') {
        setTranslationStatus('error');
        setTranslationError(job.error || '页面翻译失败');
      }
    };
    try {
      const existing = (await listAiJobs(resourceId, conversationId)).find((job) => (
        job.status === 'queued' || job.status === 'running' || job.status === 'completed'
      ));
      let job = existing;
      if (!job) {
        let pending = translationStartPromises.get(selectedItem.id);
        if (!pending) {
          pending = (async () => {
            await waitForServerStateWrites();
            const createdAt = Date.now();
            return startAiJob({
              configId: config.id,
              model,
              bookId: resourceId,
              resourceType: 'rss',
              rssItemId: selectedItem.id,
              purpose: 'translation',
              conversationId,
              userMessage: {
                id: createUuid(),
                content: '请读取当前 RSS 正文并完整翻译成简体中文。保留标题、段落、列表、小标题、链接文字和引用关系，使用清晰的 Markdown 输出；不要总结、删减、补写或解释。原文已经是中文时，忠实整理为可读的简体中文。',
                createdAt,
              },
              session: { title: `页面翻译：${selectedItem.title}`.slice(0, 100), createdAt },
              currentText: '',
            });
          })();
          translationStartPromises.set(selectedItem.id, pending);
        }
        job = await pending;
      }
      applyTranslationJob(job);
      if (job.status === 'queued' || job.status === 'running') {
        const controller = new AbortController();
        try {
          await watchAiJob(job.id, applyTranslationJob, controller.signal);
        } catch {
          let latest = job;
          while (latest.status === 'queued' || latest.status === 'running') {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            latest = await getAiJob(job.id);
            applyTranslationJob(latest);
          }
        }
      }
    } catch (error) {
      translationStartPromises.delete(selectedItem.id);
      const message = error instanceof Error ? error.message : '页面翻译失败';
      setTranslationStatus('error');
      setTranslationError(message);
      Toast.error(message);
    }
  }, [aiPreferences.model, aiPreferences.provider, configs, selectedItem, updateRssItem]);

  const runDigest = useCallback(async (date = selectedDigest?.date ?? todayKey) => {
    setDigestGenerating(true);
    setDigestError('');
    try {
      await waitForServerStateWrites();
      const result = await generateRssDigest(date, true);
      if (!result.job) {
        await refreshServerState();
        await useLearningStore.persist.rehydrate();
        setDigestGenerating(false);
        return;
      }
      const applyDigestJob = async (job: AiJob) => {
        if (job.status === 'queued' || job.status === 'running') return;
        await refreshServerState();
        await useLearningStore.persist.rehydrate();
        if (job.status === 'completed') {
          Toast.success('日报已更新');
        } else if (job.status === 'failed') {
          setDigestError(job.error || '日报生成失败');
        }
        setDigestGenerating(false);
      };
      try {
        await watchAiJob(result.job.id, (job) => void applyDigestJob(job), new AbortController().signal);
      } catch {
        let latest = result.job;
        while (latest.status === 'queued' || latest.status === 'running') {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          latest = await getAiJob(latest.id);
        }
        await applyDigestJob(latest);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '日报生成失败';
      await refreshServerState()
        .then(() => useLearningStore.persist.rehydrate())
        .catch(() => undefined);
      setDigestGenerating(false);
      setDigestError(message);
      Toast.error(message);
    }
  }, [selectedDigest?.date, todayKey]);

  const addSubscription = async (event: FormEvent) => {
    event.preventDefault();
    const url = feedUrl.trim();
    if (!url) return;
    if (feeds.some((feed) => feed.url === url)) {
      Toast.warning('这个订阅源已经存在');
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetchRssFeed(url);
      const id = createUuid();
      const feed = normalizedFeed(id, feedType, feedFolderId || undefined, result, feedTitle);
      upsertRssFeed(feed);
      mergeRssItems(id, fetchedItemsForFeed(id, result));
      setSelectedFeedId(id);
      setAddVisible(false);
      setFeedUrl('');
      setFeedTitle('');
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
    setFolderVisible(false);
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
      content: childCount > 0
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
      const outlines = Array.from(document.querySelectorAll('outline[xmlUrl]'));
      let imported = 0;
      let failed = 0;
      for (const outline of outlines) {
        const url = outline.getAttribute('xmlUrl')?.trim();
        if (!url || useLearningStore.getState().rssFeeds.some((feed) => feed.url === url)) continue;
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
          let folder = useLearningStore.getState().rssFolders.find((item) => item.name === folderNameFromOpml);
          if (!folder) {
            const timestamp = Date.now();
            folder = { id: createUuid(), name: folderNameFromOpml, createdAt: timestamp, updatedAt: timestamp };
            useLearningStore.getState().addRssFolder(folder);
          }
          folderId = folder.id;
        }
        const declaredType = outline.getAttribute('learningCenterType');
        const type: RssFeedType = declaredType === 'video' || declaredType === 'social' ? declaredType : 'article';
        const fetchFullContent = outline.getAttribute('learningCenterFetchFullContent') === 'true';
        try {
          const result = await fetchRssFeed(url);
          const id = createUuid();
          const title = outline.getAttribute('title') || outline.getAttribute('text') || undefined;
          useLearningStore.getState().upsertRssFeed(normalizedFeed(id, type, folderId, result, title, fetchFullContent));
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

  const selectSource = (sourceId: string) => {
    if (!mobileLayout) {
      if (sourceId === 'daily') setActivePanel(null);
      setSelectedFeedId(sourceId);
      return;
    }
    setActivePanel(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('source', sourceId);
      next.set('view', 'items');
      next.delete('item');
      next.delete('digest');
      next.delete('panel');
      if (RSS_SMART_SOURCE_IDS.has(sourceId)) next.delete('feed');
      else next.set('feed', sourceId);
      return next;
    }, { replace: false });
  };

  const openDigest = (digest: RssDailyDigest) => {
    if (mobileLayout) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('source', 'daily');
        next.set('digest', digest.id);
        next.set('view', 'detail');
        next.delete('feed');
        next.delete('item');
        next.delete('panel');
        return next;
      }, { replace: false });
      return;
    }
    setSelectedDigestId(digest.id);
  };

  const openItem = (item: RssItem) => {
    if (mobileLayout) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('source', selectedFeedId);
        next.set('feed', item.feedId);
        next.set('item', item.id);
        next.set('view', 'detail');
        next.delete('panel');
        return next;
      }, { replace: false });
    } else {
      setSelectedItemId(item.id);
    }
    if (!item.readAt) updateRssItem(item.id, { readAt: Date.now() });
  };

  const showMobileSources = () => {
    setActivePanel(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('view', 'sources');
      next.delete('item');
      next.delete('digest');
      next.delete('panel');
      return next;
    }, { replace: true });
  };

  const showMobileItems = () => {
    setActivePanel(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('view', 'items');
      next.delete('item');
      next.delete('digest');
      next.delete('panel');
      return next;
    }, { replace: true });
  };

  const changeMobilePanel = (panel: RssMobilePanel) => {
    if (!panel) {
      const state = location.state as { rssMobilePanelEntry?: boolean } | null;
      if (state?.rssMobilePanelEntry) {
        navigate(-1);
        return;
      }
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('panel');
        return next;
      }, { replace: true });
      return;
    }
    const replacingPanel = Boolean(mobilePanel);
    const previousState = location.state && typeof location.state === 'object'
      ? location.state as Record<string, unknown>
      : {};
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('panel', panel);
      return next;
    }, {
      replace: replacingPanel,
      state: replacingPanel ? previousState : { ...previousState, rssMobilePanelEntry: true },
    });
  };

  const selectRange = (range: TimeRange) => {
    setTimeRange(range);
  };

  const openContentImage = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    const image = target.closest<HTMLImageElement>('img[data-rss-content-image="true"]');
    if (!image) return false;
    setImageViewer({ src: image.currentSrc || image.src, alt: image.alt || '文章图片' });
    return true;
  };

  const clearNativeSelection = () => {
    window.getSelection()?.removeAllRanges();
    setRssSelection(null);
  };

  const openAnnotationTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element) || target.closest('a[href]')) return false;
    const marker = target.closest<HTMLElement>('[data-rss-annotation-id]');
    const annotationId = marker?.dataset.rssAnnotationId;
    if (!marker || !annotationId || !selectedAnnotations.some((annotation) => annotation.id === annotationId)) return false;
    const rect = marker.getBoundingClientRect();
    setRssSelection(null);
    setPendingCommentSelection(null);
    setCommentingAnnotationId(null);
    setActiveAnnotationTarget({
      highlightId: annotationId,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
    return true;
  };

  const syncActiveHeading = (article: HTMLElement) => {
    const headings = Array.from(article.querySelectorAll<HTMLElement>('.rss-article__body h1[id], .rss-article__body h2[id], .rss-article__body h3[id]'));
    if (!headings.length) return;
    const articleTop = article.getBoundingClientRect().top + 96;
    const active = headings.reduce((current, heading) => (
      heading.getBoundingClientRect().top <= articleTop ? heading : current
    ), headings[0]);
    setActiveHeadingId((current) => current === active.id ? current : active.id);
  };

  const jumpToHeading = (headingId: string) => {
    const heading = articleBodyRef.current?.querySelector<HTMLElement>(`#${headingId}`);
    if (!heading) return;
    setActiveHeadingId(headingId);
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const jumpToAnnotation = (annotation: RssAnnotation) => {
    const marker = articleBodyRef.current?.querySelector<HTMLElement>(`[data-rss-annotation-id="${annotation.id}"]`);
    if (!marker) {
      Toast.warning('原文内容发生变化，暂时无法定位这条评论');
      return;
    }
    marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    marker.focus({ preventScroll: true });
  };

  const handleArticleContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (openContentImage(event.target)) return;
    if (openAnnotationTarget(event.target)) return;
    setActiveAnnotationTarget(null);
  };

  const handleArticleContentKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!openContentImage(event.target) && !openAnnotationTarget(event.target)) return;
    event.preventDefault();
  };

  const addSelectionAnnotation = (selection: RssReaderSelection, kind: RssAnnotation['kind'], comment?: string) => {
    if (!selectedItemId) return false;
    const overlaps = selectedAnnotations.some((annotation) => (
      selection.startOffset < annotation.endOffset && selection.endOffset > annotation.startOffset
    ));
    if (overlaps) {
      Toast.info('这段内容已经包含高亮或评论');
      clearNativeSelection();
      return false;
    }
    addRssAnnotation({
      id: createUuid(),
      itemId: selectedItemId,
      kind,
      text: selection.text,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      prefix: selection.prefix,
      suffix: selection.suffix,
      ...(comment ? { comment, commentUpdatedAt: Date.now() } : {}),
      createdAt: Date.now(),
    });
    clearNativeSelection();
    return true;
  };

  const askAboutRssSelection = () => {
    if (!rssSelection) return;
    setAiQuote(rssSelection.text);
    if (mobileLayout) changeMobilePanel('ai');
    else setActivePanel('ai');
    clearNativeSelection();
  };

  const saveRssHighlight = () => {
    if (rssSelection && addSelectionAnnotation(rssSelection, 'highlight')) Toast.success('已高亮');
  };

  const createRssComment = () => {
    if (!rssSelection) return;
    setPendingCommentSelection(rssSelection);
    setCommentDraft('');
    clearNativeSelection();
  };

  const saveRssComment = () => {
    const comment = commentDraft.trim();
    if (pendingCommentSelection) {
      if (!comment) return;
      if (addSelectionAnnotation(pendingCommentSelection, 'comment', comment)) {
        setPendingCommentSelection(null);
        setCommentDraft('');
        if (!mobileLayout) setActivePanel('comments');
        Toast.success('评论已保存');
      }
      return;
    }
    if (!activeAnnotation) return;
    if (!comment && activeAnnotation.kind === 'comment') {
      deleteRssAnnotation(activeAnnotation.id);
      setActiveAnnotationTarget(null);
      setCommentingAnnotationId(null);
      setCommentDraft('');
      Toast.success('评论已删除');
      return;
    }
    updateRssAnnotation(activeAnnotation.id, {
      comment: comment || undefined,
      commentUpdatedAt: comment ? Date.now() : undefined,
    });
    setCommentingAnnotationId(null);
    setCommentDraft('');
    if (comment && !mobileLayout) setActivePanel('comments');
    Toast.success(comment ? '评论已保存' : '评论已移除，高亮已保留');
  };

  const cancelCommentEditing = () => {
    setPendingCommentSelection(null);
    setCommentingAnnotationId(null);
    setCommentDraft('');
  };

  const editAnnotationComment = () => {
    if (!activeAnnotation) return;
    setCommentDraft(activeAnnotation.comment ?? '');
    setCommentingAnnotationId(activeAnnotation.id);
  };

  const deleteActiveAnnotation = () => {
    if (!activeAnnotation) return;
    deleteRssAnnotation(activeAnnotation.id);
    setActiveAnnotationTarget(null);
    setCommentingAnnotationId(null);
    setCommentDraft('');
    Toast.success('已取消高亮');
  };

  const clearAiQuote = useCallback(() => setAiQuote(undefined), []);

  const handleSourceDragStart = (start: DragStart, provided: ResponderProvided) => {
    setSourceMenu(null);
    setItemMenu(null);
    if (start.type === RSS_FOLDER_DRAG_TYPE) {
      const folderId = start.draggableId.slice(RSS_FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((item) => item.id === folderId);
      provided.announce(`已抓取文件夹“${folder?.name ?? '未命名文件夹'}”，使用方向键调整位置，空格键放下。`);
      return;
    }
    const feedId = start.draggableId.slice(RSS_FEED_DRAG_PREFIX.length);
    const feed = feeds.find((item) => item.id === feedId);
    provided.announce(`已抓取订阅源“${feed?.title ?? '未命名订阅源'}”，使用方向键调整位置或移动到文件夹，空格键放下。`);
  };

  const handleSourceDragUpdate = (update: DragUpdate, provided: ResponderProvided) => {
    if (!update.destination) {
      provided.announce('当前不在可放置区域。');
      return;
    }
    if (update.type === RSS_FOLDER_DRAG_TYPE) {
      provided.announce(`文件夹将移动到第 ${update.destination.index + 1} 位。`);
      return;
    }
    const folderId = folderIdFromFeedsDroppable(update.destination.droppableId);
    if (folderId === null) return;
    const destinationName = folderId
      ? folders.find((folder) => folder.id === folderId)?.name ?? '未命名文件夹'
      : '未分类';
    provided.announce(`订阅源将移动到“${destinationName}”的第 ${update.destination.index + 1} 位。`);
  };

  const handleSourceDragEnd = (result: DropResult, provided: ResponderProvided) => {
    const { destination, draggableId, source, type } = result;
    if (!destination) {
      provided.announce('已取消拖动。');
      return;
    }

    if (type === RSS_FOLDER_DRAG_TYPE) {
      if (source.index === destination.index) {
        provided.announce('文件夹位置未改变。');
        return;
      }
      const folderId = draggableId.slice(RSS_FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((item) => item.id === folderId);
      const remainingFolders = folders.filter((item) => item.id !== folderId);
      moveRssFolder(folderId, remainingFolders[destination.index]?.id);
      provided.announce(`已将文件夹“${folder?.name ?? '未命名文件夹'}”移动到第 ${destination.index + 1} 位。`);
      return;
    }

    if (type !== RSS_FEED_DRAG_TYPE) return;
    const destinationFolderId = folderIdFromFeedsDroppable(destination.droppableId);
    if (destinationFolderId === null) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      provided.announce('订阅源位置未改变。');
      return;
    }

    const feedId = draggableId.slice(RSS_FEED_DRAG_PREFIX.length);
    const feed = feeds.find((item) => item.id === feedId);
    const destinationFolder = destinationFolderId
      ? folders.find((item) => item.id === destinationFolderId)
      : undefined;
    if (!feed || (destinationFolderId && !destinationFolder)) return;

    const destinationFeeds = (destinationFolderId
      ? folderFeeds.get(destinationFolderId) ?? []
      : unfiledFeeds).filter((item) => item.id !== feedId);
    moveRssFeed(feedId, destinationFolderId, destinationFeeds[destination.index]?.id);
    if (destinationFolderId) {
      setExpandedFolders((current) => new Set(current).add(destinationFolderId));
    }

    const destinationName = destinationFolder?.name ?? '未分类';
    if ((feed.folderId ?? undefined) !== destinationFolderId) {
      Toast.success(`已将“${feed.title}”移到“${destinationName}”`);
    }
    provided.announce(`已将订阅源“${feed.title}”放到“${destinationName}”的第 ${destination.index + 1} 位。`);
  };

  const selectedSourceTitle = selectedFeedId === 'daily'
    ? '日报'
    : selectedFeedId === 'all'
      ? '全部订阅'
    : selectedFeedId === 'unread'
      ? '未读内容'
      : selectedFeedId === 'bookmarked'
        ? '我的收藏'
        : feedById.get(selectedFeedId)?.title ?? '订阅内容';
  const unreadVisibleItems = filteredItems.filter((item) => !item.readAt);

  const sourceActions = (
    <Dropdown
      trigger="click"
      visible={sourceActionsVisible}
      onVisibleChange={setSourceActionsVisible}
      render={(
        <Dropdown.Menu>
          <Dropdown.Item icon={<IconRefresh />} onClick={() => { setSourceActionsVisible(false); void refreshFeeds(feeds); }}>刷新全部订阅</Dropdown.Item>
          <Dropdown.Item icon={<IconCheckList />} onClick={() => { setSourceActionsVisible(false); markRssItemsRead(); }}>全部标为已读</Dropdown.Item>
          <Dropdown.Item icon={<IconFolderOpen />} onClick={() => { setSourceActionsVisible(false); setManageVisible(true); }}>管理订阅源</Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item icon={<IconImport />} onClick={() => { setSourceActionsVisible(false); opmlInputRef.current?.click(); }}>导入 OPML</Dropdown.Item>
          <Dropdown.Item icon={<IconExport />} onClick={() => { setSourceActionsVisible(false); exportOpml(feeds, folders); }}>导出 OPML</Dropdown.Item>
        </Dropdown.Menu>
      )}
    >
      <Button aria-label="更多 RSS 操作" icon={<IconMore />} size="small" theme="borderless" type="tertiary" />
    </Dropdown>
  );

  const sourceRow = (feed: RssFeed, index: number) => (
    <Draggable
      disableInteractiveElementBlocking
      draggableId={`${RSS_FEED_DRAG_PREFIX}${feed.id}`}
      index={index}
      key={feed.id}
    >
      {(provided, snapshot) => (
        <button
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`rss-source-row rss-source-row--draggable${selectedFeedId === feed.id ? ' rss-source-row--active' : ''}${snapshot.isDragging ? ' rss-source-row--dragging' : ''}${snapshot.isDropAnimating ? ' rss-source-row--drop-animating' : ''}`}
          style={provided.draggableProps.style}
          type="button"
          title="拖拽可调整排序或移动到文件夹"
          onClick={() => selectSource(feed.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setItemMenu(null);
            setSourceMenu({ feed, x: event.clientX, y: event.clientY });
          }}
        >
          <span className="rss-source-row__icon"><FeedTypeIcon type={feed.type} /></span>
          <span className="rss-source-row__copy">
            <span className="rss-source-row__name">{feed.title}</span>
          </span>
          {refreshingIds.has(feed.id) ? <Spin size="small" /> : (unreadByFeed.get(feed.id) ?? 0) > 0 ? <span className="rss-source-count">{unreadByFeed.get(feed.id)}</span> : null}
        </button>
      )}
    </Draggable>
  );

  const sourceListContent = (
    <DragDropContext
      dragHandleUsageInstructions="按空格键开始拖动，使用方向键调整位置，再按空格键放下；按 Escape 取消。"
      onDragStart={handleSourceDragStart}
      onDragUpdate={handleSourceDragUpdate}
      onDragEnd={handleSourceDragEnd}
    >
      <div className="rss-source-list">
        <div className="rss-smart-sources">
          <button className={`rss-source-row rss-source-row--smart${selectedFeedId === 'daily' ? ' rss-source-row--active' : ''}`} type="button" onClick={() => selectSource('daily')}>
            <span className="rss-source-row__icon"><IconCalendarClock /></span>
            <span className="rss-source-row__name">日报</span>
            <span className="rss-source-count">{dailyDigests.length}</span>
          </button>
          <button className={`rss-source-row rss-source-row--smart${selectedFeedId === 'unread' ? ' rss-source-row--active' : ''}`} type="button" onClick={() => selectSource('unread')}>
            <span className="rss-source-row__icon"><IconMailStroked /></span>
            <span className="rss-source-row__name">未读</span>
            <span className="rss-source-count">{totalUnread}</span>
          </button>
          <button className={`rss-source-row rss-source-row--smart${selectedFeedId === 'bookmarked' ? ' rss-source-row--active' : ''}`} type="button" onClick={() => selectSource('bookmarked')}>
            <span className="rss-source-row__icon"><IconBookmark /></span>
            <span className="rss-source-row__name">收藏</span>
            <span className="rss-source-count">{totalBookmarked}</span>
          </button>
          <button className={`rss-source-row rss-source-row--all${selectedFeedId === 'all' ? ' rss-source-row--active' : ''}`} type="button" onClick={() => selectSource('all')}>
            <span className="rss-source-row__icon"><IconInbox /></span>
            <span className="rss-source-row__name">全部</span>
            <span className="rss-source-count">{items.length}</span>
          </button>
        </div>
        <div className="rss-source-section-label">
          <span>文件夹</span>
          <Tooltip content="新建文件夹">
            <Button aria-label="新建文件夹" icon={<IconPlus />} size="small" theme="borderless" type="tertiary" onClick={() => setFolderVisible(true)} />
          </Tooltip>
        </div>
        <Droppable droppableId={RSS_FOLDER_DROPPABLE_ID} type={RSS_FOLDER_DRAG_TYPE}>
          {(folderDropProvided) => (
            <div
              ref={folderDropProvided.innerRef}
              {...folderDropProvided.droppableProps}
              className="rss-folder-list"
            >
              {folders.map((folder, folderIndex) => {
                const childFeeds = folderFeeds.get(folder.id) ?? [];
                const expanded = expandedFolders.has(folder.id);
                return (
                  <Draggable
                    disableInteractiveElementBlocking
                    draggableId={`${RSS_FOLDER_DRAG_PREFIX}${folder.id}`}
                    index={folderIndex}
                    key={folder.id}
                  >
                    {(folderDragProvided, folderDragSnapshot) => (
                      <div
                        ref={folderDragProvided.innerRef}
                        {...folderDragProvided.draggableProps}
                        className={`rss-folder-group${folderDragSnapshot.isDragging ? ' rss-folder-group--dragging' : ''}${folderDragSnapshot.isDropAnimating ? ' rss-folder-group--drop-animating' : ''}`}
                        style={folderDragProvided.draggableProps.style}
                      >
                        <Droppable droppableId={folderFeedsDroppableId(folder.id)} type={RSS_FEED_DRAG_TYPE}>
                          {(feedDropProvided, feedDropSnapshot) => (
                            <div
                              ref={feedDropProvided.innerRef}
                              {...feedDropProvided.droppableProps}
                              className={`rss-folder-drop-zone${feedDropSnapshot.isDraggingOver ? ' rss-folder-drop-zone--active' : ''}`}
                            >
                              <button
                                {...folderDragProvided.dragHandleProps}
                                className="rss-folder-row"
                                type="button"
                                title="拖拽可调整文件夹顺序，也可将订阅源拖入"
                                aria-expanded={expanded}
                                onClick={() => setExpandedFolders((current) => {
                                  const next = new Set(current);
                                  if (next.has(folder.id)) next.delete(folder.id);
                                  else next.add(folder.id);
                                  return next;
                                })}
                              >
                                {expanded ? <IconChevronDown /> : <IconChevronRight />}
                                <IconFolderOpen />
                                <span>{folder.name}</span>
                                <Text size="small" type="tertiary">{childFeeds.length}</Text>
                              </button>
                              <div className={`rss-folder-children${expanded ? '' : ' rss-folder-children--collapsed'}`}>
                                {expanded && childFeeds.map(sourceRow)}
                                {feedDropProvided.placeholder}
                              </div>
                            </div>
                          )}
                        </Droppable>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {folderDropProvided.placeholder}
            </div>
          )}
        </Droppable>
        <Droppable droppableId={RSS_UNFILED_DROPPABLE_ID} type={RSS_FEED_DRAG_TYPE}>
          {(unfiledDropProvided, unfiledDropSnapshot) => (
            <div
              ref={unfiledDropProvided.innerRef}
              {...unfiledDropProvided.droppableProps}
              className={`rss-unfiled-drop-zone${unfiledDropSnapshot.isDraggingOver ? ' rss-unfiled-drop-zone--active' : ''}`}
            >
              <div className="rss-source-section-label rss-source-section-label--drop-zone">
                <span>未分类</span>
              </div>
              {unfiledFeeds.map(sourceRow)}
              {unfiledDropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </DragDropContext>
  );

  const itemsContent = selectedFeedId === 'daily' ? (
    <div className="rss-item-list rss-digest-list">
      {digestList.map((digest) => {
        const isToday = digest.date === todayKey;
        return (
          <button
            className={`rss-item-row rss-digest-row${selectedDigest?.id === digest.id ? ' rss-item-row--active' : ''}`}
            key={digest.id}
            type="button"
            onClick={() => openDigest(digest)}
          >
            <span className="rss-item-row__title">{isToday ? '[正在产出中] ' : ''}{digestDateLabel(digest.date)}日报</span>
            <span className="rss-item-row__excerpt">
              {digest.content ? digest.content.replace(/[#*_>`\[\]()]/g, '').replace(/\s+/g, ' ').slice(0, 92) : isToday && todayItems.length ? '等待 AI 整理今天的未读内容' : '这一天还没有可展示的日报'}
            </span>
            <span className="rss-item-row__meta">
              <span>{digest.itemCount} 条内容 · {digest.sourceFeedIds.length} 个来源</span>
              {digest.updatedAt > 0 && <time>{itemTime(digest.updatedAt)}</time>}
            </span>
          </button>
        );
      })}
    </div>
  ) : (
    <>
      <div className="rss-time-filter">
        <ButtonGroup aria-label="时间范围">
          <Button size="small" theme={timeRange === 'today' ? 'solid' : 'borderless'} type="tertiary" onClick={() => selectRange('today')}>今天</Button>
          <Button size="small" theme={timeRange === 'seven-days' ? 'solid' : 'borderless'} type="tertiary" onClick={() => selectRange('seven-days')}>7 天</Button>
          <Button size="small" theme={timeRange === 'all' ? 'solid' : 'borderless'} type="tertiary" onClick={() => selectRange('all')}>全部</Button>
        </ButtonGroup>
      </div>
      <div className="rss-item-list">
        {filteredItems.length ? filteredItems.map((item) => {
          const feed = feedById.get(item.feedId);
          const searchPreview = searchPreviews.get(item.id);
          return (
            <button
              className={`rss-item-row${selectedItem?.id === item.id ? ' rss-item-row--active' : ''}${item.readAt ? ' rss-item-row--read' : ''}`}
              key={item.id}
              type="button"
              onClick={() => openItem(item)}
              onContextMenu={(event) => {
                event.preventDefault();
                setSourceMenu(null);
                setItemMenu({ item, x: event.clientX, y: event.clientY });
              }}
            >
              <span className="rss-item-row__title"><HighlightedText text={item.title} query={query} /></span>
              {searchPreview && (
                <span className="rss-item-row__excerpt"><HighlightedText text={searchPreview} query={query} /></span>
              )}
              <span className="rss-item-row__meta">
                <span className="rss-item-row__type-icon" aria-label={feed ? feedTypeLabels[feed.type] : '内容'}><FeedTypeIcon type={feed?.type ?? 'article'} /></span>
                <span><HighlightedText text={feed?.title ?? '未知订阅源'} query={query} /></span>
                <time>{itemTime(item.publishedAt)}</time>
                {item.bookmarkedAt && <IconBookmark />}
              </span>
            </button>
          );
        }) : <Empty title="没有符合条件的内容" description={feeds.length ? '尝试切换时间范围或搜索词' : '先添加一个 RSS 或 Atom 订阅源'} />}
      </div>
    </>
  );

  const articleContent = selectedDigest ? (
    <RssDigestArticle
      date={selectedDigest.date}
      digest={selectedDigest.content ? selectedDigest : undefined}
      error={digestError}
      feeds={feeds}
      generating={digestGenerating}
      items={items}
      style={articleStyle}
      onGenerate={() => void runDigest(selectedDigest.date)}
    />
  ) : selectedItem ? (
    <article
      ref={articleRef}
      className="rss-article"
      style={articleStyle}
      onScroll={(event) => {
        setRssSelection(null);
        setActiveAnnotationTarget(null);
        syncActiveHeading(event.currentTarget);
        const title = event.currentTarget.querySelector<HTMLElement>('.rss-article__title');
        if (!title) return;
        setShowScrolledTitle(title.offsetTop + title.offsetHeight <= event.currentTarget.scrollTop + 12);
      }}
    >
      <div className="rss-article__inner">
        <Text size="small" type="secondary"><HighlightedText text={selectedFeed?.title ?? '未知订阅源'} query={query} /> · {selectedFeed ? feedTypeLabels[selectedFeed.type] : '内容'}</Text>
        <Title className="rss-article__title" heading={3}><HighlightedText text={selectedItem.title} query={query} /></Title>
        <Text size="small" type="tertiary">
          {itemDateTime(selectedItem.publishedAt)}
          {selectedItem.author && <> · <HighlightedText text={selectedItem.author} query={query} /></>}
          {selectedItem.fullContentFetchedAt && <> · 已读取原文</>}
        </Text>
        <section className="rss-ai-summary" aria-live="polite">
          <div className="rss-ai-summary__heading"><IconAIStrokedLevel1 /><Text strong>AI 摘要</Text></div>
          {selectedItem.aiSummary && selectedItem.aiSummaryVersion === 2 ? (
            <p>{selectedItem.aiSummary}</p>
          ) : summaryStatus === 'generating' ? (
            <div className="rss-ai-summary__loading"><Spin size="small" /><Text size="small" type="tertiary">正在阅读并总结当前内容…</Text></div>
          ) : summaryStatus === 'unavailable' ? (
            <Text size="small" type="tertiary">请先在设置页添加并选择模型，进入内容后会自动生成摘要。</Text>
          ) : summaryStatus === 'error' ? (
            <Text size="small" type="danger">{summaryError}</Text>
          ) : null}
        </section>
        {translationVisible && translationStatus === 'generating' ? (
          <div className="rss-translation-status" aria-live="polite">
            <Spin size="small" />
            <Text type="tertiary">正在翻译当前页面…</Text>
          </div>
        ) : translationVisible && selectedItem.aiTranslation ? (
          <section className="rss-translation" aria-label="当前页面中文翻译">
            <div className="rss-translation__heading"><IconLanguage /><Text strong>中文翻译</Text></div>
            <CspSafeMarkdown className="rss-translation__content" content={selectedItem.aiTranslation} />
          </section>
        ) : translationVisible && translationStatus === 'error' ? (
          <div className="rss-translation-status"><Text type="danger">{translationError}</Text></div>
        ) : sanitizedContentHtml ? (
          <div
            ref={articleBodyRef}
            className="rss-article__body rss-article__body--rich"
            dangerouslySetInnerHTML={sanitizedContentMarkup}
            onClick={handleArticleContentClick}
            onKeyDown={handleArticleContentKeyDown}
          />
        ) : <Empty title="订阅源没有提供正文" description="可以打开原文，或让 AI 根据已有摘要和页面链接继续了解" />}
      </div>
    </article>
  ) : <Empty title="选择一条订阅内容" description="内容详情、收藏和 AI 摘要会显示在这里" />;

  return (
    <main className="rss-page">
      {mobileLayout ? (
        <RssMobileWorkspace
          activePanel={mobilePanel}
          articleFetching={Boolean(selectedItem && fetchingArticleIds.has(selectedItem.id))}
          bookmarked={Boolean(selectedItem?.bookmarkedAt)}
          canFetchArticle={Boolean(selectedItem?.link)}
          detailContent={articleContent}
          detailActions={selectedDigest ? (
            <>
              <Button aria-label="重新生成这份日报" icon={<IconRefresh />} loading={digestGenerating} theme="borderless" type="tertiary" onClick={() => void runDigest(selectedDigest.date)} />
              <Button aria-label="打开日报设置" icon={<IconSetting />} theme="borderless" type="tertiary" onClick={() => setDigestSettingsVisible(true)} />
            </>
          ) : selectedItem ? (
            <>
              <Button
                aria-label={selectedItem.bookmarkedAt ? '取消收藏' : '收藏'}
                aria-pressed={Boolean(selectedItem.bookmarkedAt)}
                className={selectedItem.bookmarkedAt ? 'rss-bookmark-button--active' : ''}
                icon={<IconBookmark className={selectedItem.bookmarkedAt ? 'rss-bookmark-icon--filled' : 'rss-bookmark-icon--empty'} />}
                theme="borderless"
                type="tertiary"
                onClick={() => updateRssItem(selectedItem.id, { bookmarkedAt: selectedItem.bookmarkedAt ? undefined : Date.now() })}
              />
              <Button aria-label={selectedItem.fullContentFetchedAt ? '重新读取原文' : '读取原文'} disabled={!selectedItem.link} icon={<IconGlobeStroked />} loading={fetchingArticleIds.has(selectedItem.id)} theme="borderless" type="tertiary" onClick={() => void fetchArticleContent(selectedItem)} />
              <Button aria-label={translationVisible ? '显示原文' : selectedItem.aiTranslation ? '显示中文翻译' : '翻译当前页面'} aria-pressed={translationVisible} icon={<IconLanguage />} loading={translationStatus === 'generating'} theme={translationVisible ? 'solid' : 'borderless'} type="tertiary" onClick={() => void translateCurrentPage()} />
              {selectedItem.link && <Button aria-label="打开原文" icon={<IconExternalOpen />} theme="borderless" type="tertiary" onClick={() => window.open(selectedItem.link, '_blank', 'noopener,noreferrer')} />}
            </>
          ) : undefined}
          detailIsDigest={Boolean(selectedDigest)}
          detailStatus={selectedDigest
            ? `${selectedDigest.date === todayKey ? '[正在产出中] ' : ''}${selectedDigest.itemCount} 条内容`
            : selectedItem
              ? `${selectedItem.readAt ? '已读' : '未读'} · ${summaryStatus === 'ready' ? 'AI 已总结' : summaryStatus === 'generating' ? 'AI 总结中' : '等待摘要'}`
              : '未选择内容'}
          detailTitle={selectedDigest ? `${digestDateLabel(selectedDigest.date)}日报` : selectedItem?.title}
          hasOriginalLink={Boolean(selectedItem?.link)}
          hasNextItem={Boolean(nextItem)}
          hasPreviousItem={Boolean(previousItem)}
          itemCount={selectedFeedId === 'daily' ? digestList.length : filteredItems.length}
          itemCountUnit={selectedFeedId === 'daily' ? '天' : '条内容'}
          itemsContent={itemsContent}
          itemsActions={selectedFeedId === 'daily' ? (
            <>
              <Button aria-label="立即更新今天的日报" icon={<IconRefresh />} loading={digestGenerating} theme="borderless" type="tertiary" onClick={() => void runDigest(todayKey)} />
              <Button aria-label="打开日报设置" icon={<IconSetting />} theme="borderless" type="tertiary" onClick={() => setDigestSettingsVisible(true)} />
            </>
          ) : undefined}
          panelContent={mobilePanel === 'style' ? (
            <aside className="right-panel mobile-style-panel rss-mobile-style-panel" aria-label="阅读样式">
              <div className="panel-titlebar">
                <div className="panel-titlebar__title">
                  <IconColorPalette size="large" className="panel-tool-icon" />
                  <Text strong>阅读样式</Text>
                </div>
              </div>
              <div className="mobile-style-panel__body rss-mobile-style-panel__body">
                <ReaderStylePanel preferences={readerPreferences} onChangePreferences={setReaderPreferences} />
              </div>
            </aside>
          ) : mobilePanel ? (
            <RssRightPanel activePanel={mobilePanel} item={selectedItem} items={filteredItems} feeds={feeds} query={query} selectedText={aiQuote} onClearSelectedText={clearAiQuote} />
          ) : null}
          query={query}
          sourceActions={sourceActions}
          sourceTitle={selectedSourceTitle}
          sourcesContent={sourceListContent}
          totalUnread={totalUnread}
          unreadVisibleCount={unreadVisibleItems.length}
          view={mobileView}
          onAddSource={() => setAddVisible(true)}
          onBackToItems={showMobileItems}
          onBackToSources={showMobileSources}
          onChangePanel={changeMobilePanel}
          onChangeQuery={(value) => {
            setQuery(value);
            setSelectedItemId(null);
          }}
          onFetchArticle={() => {
            if (selectedItem) void fetchArticleContent(selectedItem);
          }}
          onMarkVisibleRead={() => markRssItemsRead(unreadVisibleItems.map((item) => item.id))}
          onOpenNextItem={() => {
            if (nextItem) openItem(nextItem);
          }}
          onOpenOriginal={() => {
            if (selectedItem?.link) window.open(selectedItem.link, '_blank', 'noopener,noreferrer');
          }}
          onOpenPreviousItem={() => {
            if (previousItem) openItem(previousItem);
          }}
          onToggleBookmark={() => {
            if (selectedItem) updateRssItem(selectedItem.id, { bookmarkedAt: selectedItem.bookmarkedAt ? undefined : Date.now() });
          }}
        />
      ) : (
        <>
          <header className="rss-page__header">
            <div className="rss-page__heading">
              <Title heading={5}>RSS</Title>
              <Text size="small" type="tertiary">{totalUnread} 条未读</Text>
            </div>
            <Input
              aria-label="搜索订阅内容"
              prefix={<IconSearch />}
              placeholder="搜索订阅内容"
              showClear
              value={query}
              onChange={(value) => {
                setQuery(value);
                setSelectedItemId(null);
              }}
              className="rss-search-input"
            />
          </header>

          <div className="rss-page__workspace">
        <Allotment className="rss-allotment" separator vertical={compactLayout}>
          <Allotment.Pane minSize={compactLayout ? 120 : 160} preferredSize={compactLayout ? 180 : 220} maxSize={compactLayout ? 240 : 340}>
            <section className="rss-source-pane" aria-label="订阅源">
              <div className="rss-panel-header">
                <Text strong>订阅源</Text>
                {sourceActions}
                <Tooltip content="添加订阅源">
                  <Button aria-label="添加订阅源" icon={<IconPlus />} size="small" theme="borderless" type="tertiary" onClick={() => setAddVisible(true)} />
                </Tooltip>
              </div>
              {sourceListContent}
            </section>
          </Allotment.Pane>

          <Allotment.Pane minSize={compactLayout ? 160 : 190} preferredSize={compactLayout ? 220 : 320} maxSize={compactLayout ? 320 : 520}>
            <section className="rss-items-pane" aria-label="订阅内容列表">
              <div className="rss-panel-header">
                <Text strong ellipsis={{ showTooltip: true }}>{selectedSourceTitle}</Text>
                <Text size="small" type="tertiary">{selectedFeedId === 'daily' ? `${digestList.length} 天` : `${filteredItems.length} 条`}</Text>
                {selectedFeedId === 'daily' ? (
                  <>
                    <Tooltip content="立即更新今天的日报">
                      <Button aria-label="立即更新今天的日报" icon={<IconRefresh />} loading={digestGenerating} size="small" theme="borderless" type="tertiary" onClick={() => void runDigest(todayKey)} />
                    </Tooltip>
                    <Tooltip content="日报设置">
                      <Button aria-label="打开日报设置" icon={<IconSetting />} size="small" theme="borderless" type="tertiary" onClick={() => setDigestSettingsVisible(true)} />
                    </Tooltip>
                  </>
                ) : (
                  <Tooltip content={unreadVisibleItems.length ? `将当前列表中的 ${unreadVisibleItems.length} 条内容设为已读` : '当前列表没有未读内容'}>
                    <Button
                      aria-label="当前列表一键已读"
                      disabled={!unreadVisibleItems.length}
                      icon={<IconCheckList />}
                      size="small"
                      theme="borderless"
                      type="tertiary"
                      onClick={() => markRssItemsRead(unreadVisibleItems.map((item) => item.id))}
                    />
                  </Tooltip>
                )}
              </div>
              {itemsContent}
            </section>
          </Allotment.Pane>

          <Allotment.Pane minSize={compactLayout ? 240 : 300}>
            <section className="rss-detail-layout">
              <Allotment
                className="rss-detail-allotment"
                proportionalLayout={false}
                separator={Boolean(activePanel)}
                onDragEnd={(sizes) => {
                  if (activePanel && sizes[1]) setRssPanelWidth(clamp(sizes[1], compactLayout ? 280 : 320, 720));
                }}
              >
                <Allotment.Pane minSize={0}>
                  <div className="rss-detail-pane">
                    <div className="rss-detail-toolbar">
                      <div className={`rss-detail-toolbar__context${showScrolledTitle ? ' rss-detail-toolbar__context--title-visible' : ''}`}>
                        <Text className="rss-detail-toolbar__status" size="small" type="tertiary">
                          {selectedDigest
                            ? `${selectedDigest.date === todayKey ? '[正在产出中] ' : ''}${selectedDigest.itemCount} 条内容 · ${selectedDigest.sourceFeedIds.length} 个来源`
                            : selectedItem ? `${selectedItem.readAt ? '已读' : '未读'} · ${summaryStatus === 'ready' ? 'AI 已总结' : summaryStatus === 'generating' ? 'AI 总结中' : '等待摘要'}` : '未选择内容'}
                        </Text>
                        {(selectedItem || selectedDigest) && (
                          <Text className="rss-detail-toolbar__title" ellipsis strong title={selectedItem?.title ?? `${digestDateLabel(selectedDigest!.date)}日报`}>
                            {selectedItem ? <HighlightedText text={selectedItem.title} query={query} /> : `${digestDateLabel(selectedDigest!.date)}日报`}
                          </Text>
                        )}
                      </div>
                      {selectedItem && (
                        <>
                          <Tooltip content={selectedItem.fullContentFetchedAt ? '重新读取原文' : '读取原文'}>
                            <Button
                              aria-label={selectedItem.fullContentFetchedAt ? '重新读取原文' : '读取原文'}
                              disabled={!selectedItem.link}
                              icon={<IconGlobeStroked />}
                              loading={fetchingArticleIds.has(selectedItem.id)}
                              size="small"
                              theme="borderless"
                              type="tertiary"
                              onClick={() => void fetchArticleContent(selectedItem)}
                            />
                          </Tooltip>
                          <Tooltip content={translationVisible ? '显示原文' : selectedItem.aiTranslation ? '显示中文翻译' : '翻译当前页面'}>
                            <Button
                              aria-label={translationVisible ? '显示原文' : selectedItem.aiTranslation ? '显示中文翻译' : '翻译当前页面'}
                              aria-pressed={translationVisible}
                              icon={<IconLanguage />}
                              loading={translationStatus === 'generating'}
                              size="small"
                              theme={translationVisible ? 'solid' : 'borderless'}
                              type="tertiary"
                              onClick={() => void translateCurrentPage()}
                            />
                          </Tooltip>
                          <Popover
                            content={<ReaderStylePanel preferences={readerPreferences} onChangePreferences={setReaderPreferences} />}
                            contentClassName="reader-style-popover"
                            position="bottomRight"
                            showArrow={false}
                            trigger="click"
                            visible={stylePopoverVisible}
                            onVisibleChange={setStylePopoverVisible}
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
                          <Tooltip content={selectedItem.bookmarkedAt ? '取消收藏' : '收藏'}>
                            <Button
                              aria-label={selectedItem.bookmarkedAt ? '取消收藏' : '收藏'}
                              aria-pressed={Boolean(selectedItem.bookmarkedAt)}
                              className={selectedItem.bookmarkedAt ? 'rss-bookmark-button--active' : ''}
                              icon={<IconBookmark className={selectedItem.bookmarkedAt ? 'rss-bookmark-icon--filled' : 'rss-bookmark-icon--empty'} />}
                              size="small"
                              theme="borderless"
                              type="tertiary"
                              onClick={() => updateRssItem(selectedItem.id, { bookmarkedAt: selectedItem.bookmarkedAt ? undefined : Date.now() })}
                            />
                          </Tooltip>
                          {selectedItem.link && (
                            <Tooltip content="打开原文">
                              <Button aria-label="打开原文" icon={<IconExternalOpen />} size="small" theme="borderless" type="tertiary" onClick={() => window.open(selectedItem.link, '_blank', 'noopener,noreferrer')} />
                            </Tooltip>
                          )}
                        </>
                      )}
                      {selectedDigest && (
                        <>
                          <Tooltip content="重新生成这份日报">
                            <Button aria-label="重新生成这份日报" icon={<IconRefresh />} loading={digestGenerating} size="small" theme="borderless" type="tertiary" onClick={() => void runDigest(selectedDigest.date)} />
                          </Tooltip>
                          <Tooltip content="日报设置">
                            <Button aria-label="打开日报设置" icon={<IconSetting />} size="small" theme="borderless" type="tertiary" onClick={() => setDigestSettingsVisible(true)} />
                          </Tooltip>
                        </>
                      )}
                    </div>
                    <div className="rss-article-workspace">
                      <RssArticleToc activeHeadingId={activeHeadingId} headings={translationVisible ? [] : articleHeadings} style={articleTocStyle} onSelect={jumpToHeading} />
                      {articleContent}
                    </div>
                  </div>
                </Allotment.Pane>
                <Allotment.Pane visible={Boolean(activePanel)} preferredSize={rssPanelWidth} minSize={compactLayout ? 280 : 320} maxSize={720}>
                  {activePanel && <RssRightPanel activePanel={activePanel} annotations={selectedAnnotations} item={selectedItem} items={filteredItems} feeds={feeds} query={query} selectedText={aiQuote} onClearSelectedText={clearAiQuote} onJumpAnnotation={jumpToAnnotation} />}
                </Allotment.Pane>
              </Allotment>

              {selectedItem && <nav className="activity-bar" aria-label="RSS 辅助功能">
                <ActivityRailButton
                  active={activePanel === 'ai'}
                  ariaLabel={activePanel === 'ai' ? '收起 AI 助手' : '打开 AI 助手'}
                  icon={<IconAIStrokedLevel1 className="panel-tool-icon" />}
                  label="AI"
                  tooltip={activePanel === 'ai' ? '收起 AI 助手' : '打开 AI 助手'}
                  onClick={() => setActivePanel((current) => current === 'ai' ? null : 'ai')}
                />
                <ActivityRailButton
                  active={activePanel === 'timeline'}
                  ariaLabel={activePanel === 'timeline' ? '收起时间线' : '打开时间线'}
                  icon={<IconCalendarClock className="panel-tool-icon" />}
                  label="时间线"
                  tooltip={activePanel === 'timeline' ? '收起时间线' : '打开时间线'}
                  onClick={() => setActivePanel((current) => current === 'timeline' ? null : 'timeline')}
                />
                <ActivityRailButton
                  active={activePanel === 'comments'}
                  ariaLabel={activePanel === 'comments' ? '收起评论' : '打开评论'}
                  icon={<IconComment className="panel-tool-icon" />}
                  label="评论"
                  tooltip={activePanel === 'comments' ? '收起评论' : '打开评论'}
                  onClick={() => setActivePanel((current) => current === 'comments' ? null : 'comments')}
                />
              </nav>}
            </section>
          </Allotment.Pane>
            </Allotment>
          </div>
        </>
      )}

      <input ref={opmlInputRef} className="visually-hidden" type="file" accept=".opml,.xml,text/xml" onChange={(event) => void importOpml(event)} />

      <RssDigestSettingsSheet
        configs={configs}
        runs={digestRuns}
        settings={digestSettings}
        visible={digestSettingsVisible}
        onCancel={() => setDigestSettingsVisible(false)}
        onSave={(settings) => {
          setRssDigestSettings(settings);
          setDigestSettingsVisible(false);
          Toast.success(settings.enabled ? '日报定时任务已开启' : '日报设置已保存');
        }}
      />

      <Modal bodyStyle={rssModalBodyStyle} closable={false} title="添加订阅源" visible={addVisible} footer={null} onCancel={() => setAddVisible(false)}>
        <form className="rss-dialog-form" onSubmit={(event) => void addSubscription(event)}>
          <label><Text strong>RSS / Atom 地址</Text><Input autoFocus value={feedUrl} onChange={setFeedUrl} placeholder="https://example.com/feed.xml" /></label>
          <label><Text strong>显示名称（可选）</Text><Input value={feedTitle} onChange={setFeedTitle} placeholder="默认使用订阅源名称" /></label>
          <label><Text strong>内容类型</Text><Select value={feedType} onChange={(value) => setFeedType(String(value) as RssFeedType)}><Select.Option value="article">文章</Select.Option><Select.Option value="video">视频</Select.Option><Select.Option value="social">社交媒体</Select.Option></Select></label>
          <label><Text strong>文件夹</Text><Select value={feedFolderId || '__none__'} onChange={(value) => setFeedFolderId(value === '__none__' ? '' : String(value))}><Select.Option value="__none__">未分类</Select.Option>{folders.map((folder) => <Select.Option key={folder.id} value={folder.id}>{folder.name}</Select.Option>)}</Select></label>
          <div className="rss-dialog-actions"><Button theme="borderless" type="tertiary" onClick={() => setAddVisible(false)}>取消</Button><Button htmlType="submit" loading={submitting} theme="solid" type="primary">获取并订阅</Button></div>
        </form>
      </Modal>

      <Modal bodyStyle={rssModalBodyStyle} closable={false} title="新建文件夹" visible={folderVisible} footer={null} onCancel={() => setFolderVisible(false)}>
        <form className="rss-dialog-form" onSubmit={createFolder}>
          <label><Text strong>文件夹名称</Text><Input autoFocus value={folderName} onChange={setFolderName} placeholder="例如：产品与科技" /></label>
          <div className="rss-dialog-actions"><Button theme="borderless" type="tertiary" onClick={() => setFolderVisible(false)}>取消</Button><Button htmlType="submit" theme="solid" type="primary">创建</Button></div>
        </form>
      </Modal>

      <SideSheet
        aria-label="管理订阅源"
        bodyStyle={{ padding: 0 }}
        closable={false}
        footer={<div className="rss-manage-drawer__footer"><Button theme="solid" type="primary" onClick={() => setManageVisible(false)}>完成</Button></div>}
        maskClosable
        placement="right"
        title="管理订阅源"
        visible={manageVisible}
        width={mobileLayout ? '100vw' : 'min(820px, 92vw)'}
        onCancel={() => setManageVisible(false)}
      >
        <div className="rss-manage-dialog">
          <section><div className="rss-manage-dialog__heading"><Text strong>文件夹</Text><Button icon={<IconPlus />} size="small" theme="borderless" type="tertiary" onClick={() => { setManageVisible(false); setFolderVisible(true); }}>新建</Button></div>{folders.length ? folders.map((folder) => <div className="rss-manage-folder" key={folder.id}><Input defaultValue={folder.name} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== folder.name) updateRssFolder(folder.id, { name }); }} /><Button aria-label={`删除文件夹 ${folder.name}`} icon={<IconDeleteStroked />} theme="borderless" type="danger" onClick={() => confirmDeleteFolder(folder)} /></div>) : <Text type="tertiary">还没有文件夹</Text>}</section>
          <section>
            <Text strong>订阅源</Text>
            {feeds.length ? feeds.map((feed) => (
              <div className="rss-manage-feed" key={feed.id}>
                <div>
                  <Text strong>{feed.title}</Text>
                  <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>{feed.url}</Text>
                </div>
                <Select size="small" value={feed.folderId || '__none__'} onChange={(value) => updateRssFeed(feed.id, { folderId: value === '__none__' ? undefined : String(value) })}>
                  <Select.Option value="__none__">未分类</Select.Option>
                  {folders.map((folder) => <Select.Option key={folder.id} value={folder.id}>{folder.name}</Select.Option>)}
                </Select>
                <Select size="small" value={feed.type} onChange={(value) => updateRssFeed(feed.id, { type: String(value) as RssFeedType })}>
                  <Select.Option value="article">文章</Select.Option>
                  <Select.Option value="video">视频</Select.Option>
                  <Select.Option value="social">社交媒体</Select.Option>
                </Select>
                <label className="rss-manage-feed__full-content" title="刷新该订阅源时自动补抓原网页正文">
                  <Switch
                    aria-label={`${feed.title} 自动抓取原文`}
                    checked={Boolean(feed.fetchFullContent)}
                    size="small"
                    onChange={(checked) => updateRssFeed(feed.id, { fetchFullContent: checked })}
                  />
                  <Text size="small">自动原文</Text>
                </label>
                <Button aria-label={`删除订阅源 ${feed.title}`} icon={<IconDeleteStroked />} theme="borderless" type="danger" onClick={() => confirmDeleteFeed(feed)} />
              </div>
            )) : <Empty title="还没有订阅源" />}
          </section>
        </div>
      </SideSheet>

      <RssImageViewer image={imageViewer} onClose={() => setImageViewer(null)} />

      <ReaderSelectionOverlays
        activeHighlight={activeAnnotation}
        activeHighlightTarget={activeAnnotationTarget}
        commentDraft={commentDraft}
        commentingHighlightId={commentingAnnotationId}
        pendingCommentSelection={pendingCommentSelection}
        selection={rssSelection}
        showViewHighlight={false}
        onAskAboutSelection={askAboutRssSelection}
        onCancelCommentEditing={cancelCommentEditing}
        onCancelHighlight={deleteActiveAnnotation}
        onChangeCommentDraft={setCommentDraft}
        onCreateComment={createRssComment}
        onEditHighlightComment={editAnnotationComment}
        onSaveHighlight={saveRssHighlight}
        onSaveHighlightComment={saveRssComment}
        onViewHighlight={() => undefined}
      />

      {sourceMenu && createPortal((
        <div className="rss-context-menu">
          <Dropdown autoAdjustOverflow closeOnEsc margin={0} motion={false} position="bottomLeft" rePosKey={`${sourceMenu.x}:${sourceMenu.y}`} spacing={0} trigger="custom" visible render={<Dropdown.Menu><Dropdown.Item icon={<IconRefresh />} onClick={() => { const feed = sourceMenu.feed; setSourceMenu(null); void refreshFeed(feed); }}>刷新</Dropdown.Item><Dropdown.Item disabled={!items.some((item) => item.feedId === sourceMenu.feed.id && !item.readAt)} icon={<IconCheckList />} onClick={() => { const feed = sourceMenu.feed; setSourceMenu(null); markRssItemsRead(items.filter((item) => item.feedId === feed.id).map((item) => item.id)); }}>设为已读</Dropdown.Item><Dropdown.Item icon={<IconFolderOpen />} onClick={() => { setSourceMenu(null); setManageVisible(true); }}>管理订阅源</Dropdown.Item><Dropdown.Item type="danger" icon={<IconDeleteStroked />} onClick={() => { const feed = sourceMenu.feed; setSourceMenu(null); confirmDeleteFeed(feed); }}>删除订阅源</Dropdown.Item></Dropdown.Menu>} onVisibleChange={(visible) => { if (!visible) setSourceMenu(null); }}><span aria-hidden="true" className="cursor-context-menu-anchor" style={{ left: sourceMenu.x, top: sourceMenu.y }} tabIndex={-1} /></Dropdown>
        </div>
      ), document.body)}

      {itemMenu && createPortal((
        <div className="rss-context-menu">
          <Dropdown
            autoAdjustOverflow
            closeOnEsc
            margin={0}
            motion={false}
            position="bottomLeft"
            rePosKey={`${itemMenu.x}:${itemMenu.y}`}
            spacing={0}
            trigger="custom"
            visible
            render={(
              <Dropdown.Menu>
                {itemMenu.item.readAt ? (
                  <Dropdown.Item icon={<IconMailStroked />} onClick={() => { const item = itemMenu.item; setItemMenu(null); markRssItemsUnread([item.id]); }}>标为未读</Dropdown.Item>
                ) : (
                  <Dropdown.Item icon={<IconCheckList />} onClick={() => { const item = itemMenu.item; setItemMenu(null); markRssItemsRead([item.id]); }}>设为已读</Dropdown.Item>
                )}
                <Dropdown.Item
                  icon={<IconBookmark />}
                  onClick={() => {
                    const item = itemMenu.item;
                    setItemMenu(null);
                    updateRssItem(item.id, { bookmarkedAt: item.bookmarkedAt ? undefined : Date.now() });
                  }}
                >
                  {itemMenu.item.bookmarkedAt ? '取消收藏' : '设为收藏'}
                </Dropdown.Item>
              </Dropdown.Menu>
            )}
            onVisibleChange={(visible) => { if (!visible) setItemMenu(null); }}
          >
            <span aria-hidden="true" className="cursor-context-menu-anchor" style={{ left: itemMenu.x, top: itemMenu.y }} tabIndex={-1} />
          </Dropdown>
        </div>
      ), document.body)}
    </main>
  );
}

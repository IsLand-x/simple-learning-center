import { type Dispatch, type SetStateAction } from 'react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DragStart,
  type DragUpdate,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import { Button, ButtonGroup, Empty, Spin, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconArticle,
  IconBookmark,
  IconCalendarClock,
  IconChevronDown,
  IconChevronRight,
  IconFolderOpen,
  IconGlobeStroked,
  IconInbox,
  IconMailStroked,
  IconPlus,
  IconVideo,
} from '@douyinfe/semi-icons';
import { getRssVideoPresentation } from '../../../lib/rssVideo';
import type { RssDailyDigest, RssFeed, RssFeedType, RssFolder, RssItem } from '../../../types';
import {
  RSS_FEED_DRAG_PREFIX,
  RSS_FEED_DRAG_TYPE,
  RSS_FOLDER_DRAG_PREFIX,
  RSS_FOLDER_DRAG_TYPE,
  RSS_FOLDER_DROPPABLE_ID,
  RSS_UNFILED_DROPPABLE_ID,
  digestPreview,
  digestDateLabel,
  feedTypeLabels,
  folderFeedsDroppableId,
  itemTime,
  type TimeRange,
} from '../model/rssPageModel';
import { HighlightedText } from './RssPresentation';

const { Text } = Typography;

function FeedTypeIcon({ type }: { type: RssFeedType }) {
  if (type === 'video') return <IconVideo />;
  if (type === 'social') return <IconGlobeStroked />;
  return <IconArticle />;
}

export function RssSourceTree({
  dailyDigestCount,
  folderFeeds,
  folders,
  itemCount,
  refreshingIds,
  selectedFeedId,
  totalBookmarked,
  totalUnread,
  unfiledFeeds,
  unreadByFeed,
  expandedFolders,
  onChangeExpandedFolders,
  onClearItemMenu,
  onCreateFolder,
  onDragEnd,
  onDragStart,
  onDragUpdate,
  onOpenSourceMenu,
  onSelectSource,
}: {
  dailyDigestCount: number;
  folderFeeds: Map<string, RssFeed[]>;
  folders: RssFolder[];
  itemCount: number;
  refreshingIds: Set<string>;
  selectedFeedId: string;
  totalBookmarked: number;
  totalUnread: number;
  unfiledFeeds: RssFeed[];
  unreadByFeed: Map<string, number>;
  expandedFolders: Set<string>;
  onChangeExpandedFolders: Dispatch<SetStateAction<Set<string>>>;
  onClearItemMenu: () => void;
  onCreateFolder: () => void;
  onDragEnd: (result: DropResult, provided: ResponderProvided) => void;
  onDragStart: (start: DragStart, provided: ResponderProvided) => void;
  onDragUpdate: (update: DragUpdate, provided: ResponderProvided) => void;
  onOpenSourceMenu: (feed: RssFeed, x: number, y: number) => void;
  onSelectSource: (sourceId: string) => void;
}) {
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
          onClick={() => onSelectSource(feed.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            onClearItemMenu();
            onOpenSourceMenu(feed, event.clientX, event.clientY);
          }}
        >
          <span className="rss-source-row__icon">
            <FeedTypeIcon type={feed.type} />
          </span>
          <span className="rss-source-row__copy">
            <span className="rss-source-row__name">{feed.title}</span>
          </span>
          {refreshingIds.has(feed.id) ? (
            <Spin size="small" />
          ) : (unreadByFeed.get(feed.id) ?? 0) > 0 ? (
            <span className="rss-source-count">{unreadByFeed.get(feed.id)}</span>
          ) : null}
        </button>
      )}
    </Draggable>
  );

  return (
    <DragDropContext
      dragHandleUsageInstructions="按空格键开始拖动，使用方向键调整位置，再按空格键放下；按 Escape 取消。"
      onDragStart={onDragStart}
      onDragUpdate={onDragUpdate}
      onDragEnd={onDragEnd}
    >
      <div className="rss-source-list">
        <div className="rss-smart-sources">
          <button
            className={`rss-source-row rss-source-row--smart${selectedFeedId === 'daily' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('daily')}
          >
            <span className="rss-source-row__icon">
              <IconCalendarClock />
            </span>
            <span className="rss-source-row__name">日报</span>
            <span className="rss-source-count">{dailyDigestCount}</span>
          </button>
          <button
            className={`rss-source-row rss-source-row--smart${selectedFeedId === 'unread' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('unread')}
          >
            <span className="rss-source-row__icon">
              <IconMailStroked />
            </span>
            <span className="rss-source-row__name">未读</span>
            <span className="rss-source-count">{totalUnread}</span>
          </button>
          <button
            className={`rss-source-row rss-source-row--smart${selectedFeedId === 'bookmarked' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('bookmarked')}
          >
            <span className="rss-source-row__icon">
              <IconBookmark />
            </span>
            <span className="rss-source-row__name">收藏</span>
            <span className="rss-source-count">{totalBookmarked}</span>
          </button>
          <button
            className={`rss-source-row rss-source-row--all${selectedFeedId === 'all' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('all')}
          >
            <span className="rss-source-row__icon">
              <IconInbox />
            </span>
            <span className="rss-source-row__name">全部</span>
            <span className="rss-source-count">{itemCount}</span>
          </button>
        </div>
        <div className="rss-source-section-label">
          <span>文件夹</span>
          <Tooltip content="新建文件夹">
            <Button
              aria-label="新建文件夹"
              icon={<IconPlus />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={onCreateFolder}
            />
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
                        <Droppable
                          droppableId={folderFeedsDroppableId(folder.id)}
                          type={RSS_FEED_DRAG_TYPE}
                        >
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
                                onClick={() =>
                                  onChangeExpandedFolders((current) => {
                                    const next = new Set(current);
                                    if (next.has(folder.id)) next.delete(folder.id);
                                    else next.add(folder.id);
                                    return next;
                                  })
                                }
                              >
                                {expanded ? <IconChevronDown /> : <IconChevronRight />}
                                <IconFolderOpen />
                                <span>{folder.name}</span>
                                <Text size="small" type="tertiary">
                                  {childFeeds.length}
                                </Text>
                              </button>
                              <div
                                className={`rss-folder-children${expanded ? '' : ' rss-folder-children--collapsed'}`}
                              >
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
      <div className="rss-item-list rss-digest-list">
        {dailyDigests.map((digest) => {
          const isToday = digest.date === todayKey;
          return (
            <button
              className={`rss-item-row rss-digest-row${selectedDigestId === digest.id ? ' rss-item-row--active' : ''}`}
              key={digest.id}
              type="button"
              onClick={() => onOpenDigest(digest)}
            >
              <span className="rss-item-row__title">
                {isToday ? '[正在产出中] ' : ''}
                {digestDateLabel(digest.date)}日报
              </span>
              <span className="rss-item-row__excerpt">
                {digest.content
                  ? digestPreview(digest.content)
                  : isToday && todayItemsCount
                    ? '等待 AI 整理今天的全部内容'
                    : '这一天还没有可展示的日报'}
              </span>
              <span className="rss-item-row__meta">
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
      <div className="rss-time-filter">
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
      <div className="rss-item-list">
        {filteredItems.length ? (
          filteredItems.map((item) => {
            const feed = feedById.get(item.feedId);
            const searchPreview = searchPreviews.get(item.id);
            const videoPresentation = getRssVideoPresentation(item, feed);
            return (
              <button
                className={`rss-item-row${videoPresentation?.imageUrl ? ' rss-item-row--with-thumbnail' : ''}${selectedItemId === item.id ? ' rss-item-row--active' : ''}${item.readAt ? ' rss-item-row--read' : ''}`}
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
                    className="rss-item-row__thumbnail"
                    decoding="async"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={videoPresentation.imageUrl}
                  />
                )}
                <span className="rss-item-row__content">
                  <span className="rss-item-row__title">
                    <HighlightedText text={item.title} query={query} />
                  </span>
                  {searchPreview && (
                    <span className="rss-item-row__excerpt">
                      <HighlightedText text={searchPreview} query={query} />
                    </span>
                  )}
                  <span className="rss-item-row__meta">
                    <span
                      className="rss-item-row__type-icon"
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

function createFeedMap(feeds: RssFeed[]) {
  return new Map(feeds.map((feed) => [feed.id, feed]));
}

import {
  IconBookmark,
  IconCalendarClock,
  IconChevronDown,
  IconChevronRight,
  IconFolderOpen,
  IconInbox,
  IconMailStroked,
  IconPlus,
} from '@douyinfe/semi-icons';
import { Button, Spin, Tooltip, Typography } from '@douyinfe/semi-ui';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { useMemo } from 'react';
import type { RssFeed } from '../../../../../../contracts/rss';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { FeedTypeIcon } from './FeedTypeIcon';
import {
  RSS_FEED_DRAG_PREFIX,
  RSS_FEED_DRAG_TYPE,
  RSS_FOLDER_DRAG_PREFIX,
  RSS_FOLDER_DRAG_TYPE,
  RSS_FOLDER_DROPPABLE_ID,
  RSS_UNFILED_DROPPABLE_ID,
  folderFeedsDroppableId,
} from './sourceDrag';
import { groupSourceFeeds } from './sourceTreeData';

const { Text } = Typography;

export function SourceTree() {
  const persistedItems = useLearningStore((state) => state.rssItems);
  const persistedDailyDigests = useLearningStore((state) => state.rssDailyDigests);
  const persistedFolders = useLearningStore((state) => state.rssFolders);
  const { sources, navigation: workspace } = useWorkspace();

  const dailyDigestCount = persistedDailyDigests.length;
  const expandedFolders = sources.expandedFolders;
  const feeds = useLearningStore((state) => state.rssFeeds);
  const { folderFeeds, unfiledFeeds } = useMemo(
    () => groupSourceFeeds(persistedFolders, feeds),
    [persistedFolders, feeds],
  );
  const folders = persistedFolders;
  const itemCount = persistedItems.length;
  const refreshingIds = sources.refreshingIds;
  const selectedFeedId = workspace.selectedFeedId;
  const totalBookmarked = persistedItems.filter((item) => item.bookmarkedAt).length;
  const totalUnread = persistedItems.filter((item) => !item.readAt).length;
  const unreadByFeed = useMemo(() => {
    const counts = new Map<string, number>();
    persistedItems.forEach((item) => {
      if (!item.readAt) counts.set(item.feedId, (counts.get(item.feedId) ?? 0) + 1);
    });
    return counts;
  }, [persistedItems]);
  const onChangeExpandedFolders = sources.setExpandedFolders;
  const onClearItemMenu: () => void = () => workspace.setItemMenu(null);
  const onCreateFolder: () => void = () => sources.setFolderVisible(true);
  const onDragStart = sources.handleSourceDragStart;
  const onDragUpdate = sources.handleSourceDragUpdate;
  const onDragEnd = sources.handleSourceDragEnd;
  const onOpenSourceMenu: (feed: RssFeed, x: number, y: number) => void = (feed, x, y) =>
    workspace.setSourceMenu({ feed, x, y });
  const onSelectSource = workspace.selectSource;

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
          className={`rss-source-row w-full [color:var(--semi-color-text-1)] [background:transparent] [text-align:left] [min-height:36px] [grid-template-columns:24px_minmax(0,_1fr)_auto] [gap:7px] [padding:5px_7px] rss-source-row--draggable${selectedFeedId === feed.id ? ' rss-source-row--active' : ''}${snapshot.isDragging ? ' rss-source-row--dragging' : ''}${snapshot.isDropAnimating ? ' rss-source-row--drop-animating' : ''}`}
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
          <span className="rss-source-row__icon [width:24px] [height:24px] [place-items:center] [color:var(--semi-color-primary)] [background:var(--semi-color-primary-light-default)]">
            <FeedTypeIcon type={feed.type} />
          </span>
          <span className="rss-source-row__copy min-w-0 [gap:5px]">
            <span className="rss-source-row__name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {feed.title}
            </span>
          </span>
          {refreshingIds.has(feed.id) ? (
            <Spin size="small" />
          ) : (unreadByFeed.get(feed.id) ?? 0) > 0 ? (
            <span className="rss-source-count [min-width:18px] [color:var(--semi-color-text-2)] [text-align:right]">
              {unreadByFeed.get(feed.id)}
            </span>
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
      <div className="rss-source-list min-h-0 [padding:7px_6px_12px]">
        <div className="rss-smart-sources mobile:[gap:8px] mobile:[margin-bottom:8px]">
          <button
            className={`rss-source-row w-full [color:var(--semi-color-text-1)] [background:transparent] [text-align:left] [min-height:36px] [grid-template-columns:24px_minmax(0,_1fr)_auto] [gap:7px] [padding:5px_7px] rss-source-row--smart${selectedFeedId === 'daily' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('daily')}
          >
            <span className="rss-source-row__icon [width:24px] [height:24px] [place-items:center] [color:var(--semi-color-primary)] [background:var(--semi-color-primary-light-default)]">
              <IconCalendarClock />
            </span>
            <span className="rss-source-row__name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              日报
            </span>
            <span className="rss-source-count [min-width:18px] [color:var(--semi-color-text-2)] [text-align:right]">
              {dailyDigestCount}
            </span>
          </button>
          <button
            className={`rss-source-row w-full [color:var(--semi-color-text-1)] [background:transparent] [text-align:left] [min-height:36px] [grid-template-columns:24px_minmax(0,_1fr)_auto] [gap:7px] [padding:5px_7px] rss-source-row--smart${selectedFeedId === 'unread' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('unread')}
          >
            <span className="rss-source-row__icon [width:24px] [height:24px] [place-items:center] [color:var(--semi-color-primary)] [background:var(--semi-color-primary-light-default)]">
              <IconMailStroked />
            </span>
            <span className="rss-source-row__name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              未读
            </span>
            <span className="rss-source-count [min-width:18px] [color:var(--semi-color-text-2)] [text-align:right]">
              {totalUnread}
            </span>
          </button>
          <button
            className={`rss-source-row w-full [color:var(--semi-color-text-1)] [background:transparent] [text-align:left] [min-height:36px] [grid-template-columns:24px_minmax(0,_1fr)_auto] [gap:7px] [padding:5px_7px] rss-source-row--smart${selectedFeedId === 'bookmarked' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('bookmarked')}
          >
            <span className="rss-source-row__icon [width:24px] [height:24px] [place-items:center] [color:var(--semi-color-primary)] [background:var(--semi-color-primary-light-default)]">
              <IconBookmark />
            </span>
            <span className="rss-source-row__name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              收藏
            </span>
            <span className="rss-source-count [min-width:18px] [color:var(--semi-color-text-2)] [text-align:right]">
              {totalBookmarked}
            </span>
          </button>
          <button
            className={`rss-source-row w-full [color:var(--semi-color-text-1)] [background:transparent] [text-align:left] [min-height:36px] [grid-template-columns:24px_minmax(0,_1fr)_auto] [gap:7px] [padding:5px_7px] rss-source-row--all${selectedFeedId === 'all' ? ' rss-source-row--active' : ''}`}
            type="button"
            onClick={() => onSelectSource('all')}
          >
            <span className="rss-source-row__icon [width:24px] [height:24px] [place-items:center] [color:var(--semi-color-primary)] [background:var(--semi-color-primary-light-default)]">
              <IconInbox />
            </span>
            <span className="rss-source-row__name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              全部
            </span>
            <span className="rss-source-count [min-width:18px] [color:var(--semi-color-text-2)] [text-align:right]">
              {itemCount}
            </span>
          </button>
        </div>
        <div className="rss-source-section-label [min-height:32px] justify-between [padding:8px_7px_3px] [color:var(--semi-color-text-2)]">
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
              className="rss-folder-list [min-height:1px]"
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
                              className={`rss-folder-drop-zone [transition:background-color_160ms_ease,_box-shadow_160ms_ease] ${feedDropSnapshot.isDraggingOver ? ' rss-folder-drop-zone--active' : ''}`}
                            >
                              <button
                                {...folderDragProvided.dragHandleProps}
                                className="rss-folder-row w-full [color:var(--semi-color-text-1)] [background:transparent] [text-align:left] [min-height:34px] [grid-template-columns:16px_20px_minmax(0,_1fr)_auto] [gap:4px] [padding:4px_7px]"
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
                                className={`rss-folder-children [padding-left:12px] ${expanded ? '' : ' rss-folder-children--collapsed'}`}
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
              className={`rss-unfiled-drop-zone [transition:background-color_160ms_ease,_box-shadow_160ms_ease] ${unfiledDropSnapshot.isDraggingOver ? ' rss-unfiled-drop-zone--active' : ''}`}
            >
              <div className="rss-source-section-label [min-height:32px] justify-between [padding:8px_7px_3px] [color:var(--semi-color-text-2)] rss-source-section-label--drop-zone">
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

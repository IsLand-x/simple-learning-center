import { Toast } from '@douyinfe/semi-ui';
import type { DragStart, DragUpdate, DropResult, ResponderProvided } from '@hello-pangea/dnd';
import type { Dispatch, SetStateAction } from 'react';
import type { RssFeed, RssFolder } from '../../../../types/domain';
import type { LearningState } from '../../../../util/state/learningState';
import type { RssSourceMenuState, RssItemMenuState } from './menuTypes';
import {
  RSS_FEED_DRAG_PREFIX,
  RSS_FEED_DRAG_TYPE,
  RSS_FOLDER_DRAG_PREFIX,
  RSS_FOLDER_DRAG_TYPE,
  folderIdFromFeedsDroppable,
} from './model/rssPageModel';

interface SourceDragInput {
  feeds: RssFeed[];
  folders: RssFolder[];
  folderFeeds: Map<string, RssFeed[]>;
  unfiledFeeds: RssFeed[];
  setSourceMenu: Dispatch<SetStateAction<RssSourceMenuState | null>>;
  setItemMenu: Dispatch<SetStateAction<RssItemMenuState | null>>;
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>;
  moveRssFolder: LearningState['moveRssFolder'];
  moveRssFeed: LearningState['moveRssFeed'];
}

export function createRssSourceDragHandlers({
  feeds,
  folders,
  folderFeeds,
  unfiledFeeds,
  setSourceMenu,
  setItemMenu,
  setExpandedFolders,
  moveRssFolder,
  moveRssFeed,
}: SourceDragInput) {
  const handleSourceDragStart = (start: DragStart, provided: ResponderProvided) => {
    setSourceMenu(null);
    setItemMenu(null);
    if (start.type === RSS_FOLDER_DRAG_TYPE) {
      const folderId = start.draggableId.slice(RSS_FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((item) => item.id === folderId);
      provided.announce(
        `已抓取文件夹“${folder?.name ?? '未命名文件夹'}”，使用方向键调整位置，空格键放下。`,
      );
      return;
    }
    const feedId = start.draggableId.slice(RSS_FEED_DRAG_PREFIX.length);
    const feed = feeds.find((item) => item.id === feedId);
    provided.announce(
      `已抓取订阅源“${feed?.title ?? '未命名订阅源'}”，使用方向键调整位置或移动到文件夹，空格键放下。`,
    );
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
      ? (folders.find((folder) => folder.id === folderId)?.name ?? '未命名文件夹')
      : '未分类';
    provided.announce(
      `订阅源将移动到“${destinationName}”的第 ${update.destination.index + 1} 位。`,
    );
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
      provided.announce(
        `已将文件夹“${folder?.name ?? '未命名文件夹'}”移动到第 ${destination.index + 1} 位。`,
      );
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

    const destinationFeeds = (
      destinationFolderId ? (folderFeeds.get(destinationFolderId) ?? []) : unfiledFeeds
    ).filter((item) => item.id !== feedId);
    moveRssFeed(feedId, destinationFolderId, destinationFeeds[destination.index]?.id);
    if (destinationFolderId) {
      setExpandedFolders((current) => new Set(current).add(destinationFolderId));
    }

    const destinationName = destinationFolder?.name ?? '未分类';
    if ((feed.folderId ?? undefined) !== destinationFolderId) {
      Toast.success(`已将“${feed.title}”移到“${destinationName}”`);
    }
    provided.announce(
      `已将订阅源“${feed.title}”放到“${destinationName}”的第 ${destination.index + 1} 位。`,
    );
  };

  return { handleSourceDragStart, handleSourceDragUpdate, handleSourceDragEnd };
}

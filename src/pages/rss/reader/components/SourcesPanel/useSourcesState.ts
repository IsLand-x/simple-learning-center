import { Toast } from '@douyinfe/semi-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RssFeed, RssFolder } from '../../../../../../contracts/rss';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { confirmDialog } from '../../../../../util/confirmDialog';
import type { WorkspaceContextValue } from '../../store/workspaceTypes';
import { createRssSourceDragHandlers } from './sourceDrag';
import { groupSourceFeeds } from './sourceTreeData';
import { useImportOpml } from './useImportOpml';
import { useRefreshSources } from './useRefreshSources';
type SourceControlsInput = Pick<
  WorkspaceContextValue['navigation'],
  'setSourceMenu' | 'setItemMenu'
>;
export function useSourcesState({ setSourceMenu, setItemMenu }: SourceControlsInput) {
  const feeds = useLearningStore((state) => state.rssFeeds);
  const folders = useLearningStore((state) => state.rssFolders);
  const deleteRssFolder = useLearningStore((state) => state.deleteRssFolder);
  const deleteRssFeed = useLearningStore((state) => state.deleteRssFeed);
  const moveRssFolder = useLearningStore((state) => state.moveRssFolder);
  const moveRssFeed = useLearningStore((state) => state.moveRssFeed);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(folders.map((folder) => folder.id)),
  );
  const [addVisible, setAddVisible] = useState(false);
  const [folderVisible, setFolderVisible] = useState(false);
  const [manageVisible, setManageVisible] = useState(false);
  const [sourceActionsVisible, setSourceActionsVisible] = useState(false);
  const [createdFolderId, setCreatedFolderId] = useState('');
  const opmlInputRef = useRef<HTMLInputElement>(null);
  const refreshing = useRefreshSources();
  const importing = useImportOpml();
  useEffect(() => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      folders.forEach((folder) => next.add(folder.id));
      return next;
    });
  }, [folders]);

  const { folderFeeds, unfiledFeeds } = useMemo(
    () => groupSourceFeeds(folders, feeds),
    [folders, feeds],
  );
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
      content:
        childCount > 0
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

  const { handleSourceDragStart, handleSourceDragUpdate, handleSourceDragEnd } =
    createRssSourceDragHandlers({
      feeds,
      folders,
      folderFeeds,
      unfiledFeeds,
      setSourceMenu,
      setItemMenu,
      setExpandedFolders,
      moveRssFolder,
      moveRssFeed,
    });

  return {
    expandedFolders,
    setExpandedFolders,
    addVisible,
    setAddVisible,
    folderVisible,
    setFolderVisible,
    manageVisible,
    setManageVisible,
    sourceActionsVisible,
    setSourceActionsVisible,
    createdFolderId,
    setCreatedFolderId,
    opmlInputRef,
    confirmDeleteFeed,
    confirmDeleteFolder,
    handleSourceDragStart,
    handleSourceDragUpdate,
    handleSourceDragEnd,
    ...refreshing,
    ...importing,
  };
}

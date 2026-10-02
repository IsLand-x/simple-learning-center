import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { RssAddSourceDialog } from './RssAddSourceDialog';
import { RssCreateFolderDialog } from './RssCreateFolderDialog';
import { RssManageSourcesSheet } from './RssManageSourcesSheet';
import { RssSourceContextMenu } from './RssSourceContextMenu';

export function SourceDialogs() {
  const persistedFeeds = useLearningStore((state) => state.rssFeeds);
  const persistedItems = useLearningStore((state) => state.rssItems);
  const persistedFolders = useLearningStore((state) => state.rssFolders);
  const persistedUpdateRssFeed = useLearningStore((state) => state.updateRssFeed);
  const persistedUpdateRssFolder = useLearningStore((state) => state.updateRssFolder);
  const { sources, navigation: workspace } = useWorkspace();

  const markRssItemsRead = useLearningStore((state) => state.markRssItemsRead);

  return (
    <>
      <input
        ref={sources.opmlInputRef}
        className="visually-hidden"
        type="file"
        accept=".opml,.xml,text/xml"
        onChange={(event) => void sources.importOpml(event)}
      />

      <RssAddSourceDialog />

      <RssCreateFolderDialog />

      <RssManageSourcesSheet
        feeds={persistedFeeds}
        folders={persistedFolders}
        mobileLayout={workspace.mobileLayout}
        visible={sources.manageVisible}
        onChangeFeedFolder={(feed, folderId) => persistedUpdateRssFeed(feed.id, { folderId })}
        onChangeFeedType={(feed, type) => persistedUpdateRssFeed(feed.id, { type })}
        onClose={() => sources.setManageVisible(false)}
        onCreateFolder={() => {
          sources.setManageVisible(false);
          sources.setFolderVisible(true);
        }}
        onDeleteFeed={sources.confirmDeleteFeed}
        onDeleteFolder={sources.confirmDeleteFolder}
        onRenameFolder={(folder, name) => persistedUpdateRssFolder(folder.id, { name })}
        onToggleFullContent={(feed, checked) =>
          persistedUpdateRssFeed(feed.id, { fetchFullContent: checked })
        }
      />

      <RssSourceContextMenu
        items={persistedItems}
        menu={workspace.sourceMenu}
        onClose={() => workspace.setSourceMenu(null)}
        onDelete={sources.confirmDeleteFeed}
        onManage={() => sources.setManageVisible(true)}
        onMarkRead={markRssItemsRead}
        onRefresh={(feed) => void sources.refreshFeed(feed)}
      />
    </>
  );
}

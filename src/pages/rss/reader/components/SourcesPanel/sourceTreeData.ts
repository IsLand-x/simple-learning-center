import type { RssFeed, RssFolder } from '../../../../../../contracts/rss';
export function groupSourceFeeds(folders: RssFolder[], feeds: RssFeed[]) {
  return {
    folderFeeds: new Map(
      folders.map((folder) => [folder.id, feeds.filter((feed) => feed.folderId === folder.id)]),
    ),
    unfiledFeeds: feeds.filter(
      (feed) => !feed.folderId || !folders.some((folder) => folder.id === feed.folderId),
    ),
  };
}

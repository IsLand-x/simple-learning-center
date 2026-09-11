import { Toast } from '@douyinfe/semi-ui';
import type { RssFeed, RssFolder } from '../../../types';

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sourceOpmlAttributes(feed: RssFeed) {
  const source = feed.source;
  const common = `learningCenterSourceKind="${source.kind}"`;
  if (source.kind === 'rss') return `${common} xmlUrl="${escapeXml(source.feedUrl)}"`;
  if (source.kind === 'bilibili-weekly') return common;
  if (source.kind === 'bilibili-up')
    return `${common} learningCenterUid="${escapeXml(source.uid)}"`;
  return `${common} learningCenterChannelId="${escapeXml(source.channelId)}" xmlUrl="${escapeXml(source.feedUrl)}"`;
}

function createOpmlDocument(feeds: RssFeed[], folders: RssFolder[]) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const grouped = new Map<string, RssFeed[]>();
  feeds.forEach((feed) => {
    const folder = feed.folderId ? (folderById.get(feed.folderId) ?? '') : '';
    grouped.set(folder, [...(grouped.get(folder) ?? []), feed]);
  });
  const outline = (feed: RssFeed) =>
    `      <outline text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" type="rss" ${sourceOpmlAttributes(feed)} htmlUrl="${escapeXml(feed.siteUrl ?? '')}" learningCenterType="${feed.type}" learningCenterFetchFullContent="${feed.fetchFullContent ? 'true' : 'false'}" />`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head><title>个人学习中心 RSS 订阅</title></head>',
    '  <body>',
  ];
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
  return lines.join('\n');
}

export function exportOpml(feeds: RssFeed[], folders: RssFolder[]) {
  if (
    feeds.some(
      (feed) => feed.source.kind === 'bilibili-weekly' || feed.source.kind === 'bilibili-up',
    )
  ) {
    Toast.warning('B站来源会保留学习中心扩展字段，其他阅读器可能无法识别；Cookie 不会导出');
  }
  const blob = new Blob([createOpmlDocument(feeds, folders)], {
    type: 'text/x-opml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `learning-center-rss-${new Date().toISOString().slice(0, 10)}.opml`;
  anchor.click();
  URL.revokeObjectURL(url);
}

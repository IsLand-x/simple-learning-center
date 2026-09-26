import type { RssItem } from '../../../../../contracts/rss';
export interface RssSearchMatch {
  start: number;
  end: number;
}

export function findRssSearchMatches(value: string, query: string): RssSearchMatch[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(value.matchAll(new RegExp(escapedQuery, 'giu')), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function rssItemContentText(item: RssItem) {
  return item.fullContentText || item.contentText;
}

export function rssSearchPreview(item: RssItem, query: string) {
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

export type RssMobileView = 'sources' | 'items' | 'detail';
export type RssMobilePanel = 'style' | 'ai' | 'timeline' | null;

export type TimeRange = 'today' | 'seven-days' | 'all';

export type RssSidePanel = 'ai' | 'timeline' | 'comments' | null;

export const RSS_SMART_SOURCE_IDS = new Set(['daily', 'all', 'unread', 'bookmarked']);

export function isRssMobileView(value: string | null): value is RssMobileView {
  return value === 'sources' || value === 'items' || value === 'detail';
}

export function isRssMobilePanel(value: string | null): value is Exclude<RssMobilePanel, null> {
  return value === 'style' || value === 'ai' || value === 'timeline';
}

export function isTimeRange(value: string | null): value is TimeRange {
  return value === 'today' || value === 'seven-days' || value === 'all';
}

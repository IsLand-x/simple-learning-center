import type { RssFeed, RssItem } from '../../../../types/domain';

export interface RssSourceMenuState {
  feed: RssFeed;
  x: number;
  y: number;
}

export interface RssItemMenuState {
  item: RssItem;
  x: number;
  y: number;
}

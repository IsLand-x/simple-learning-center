import type { RssFeed, RssItem } from '../../../../util/types';

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

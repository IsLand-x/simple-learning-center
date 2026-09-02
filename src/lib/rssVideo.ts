import type { RssFeed, RssItem } from '../types';

const BILIBILI_BVID_PATTERN = /\b(BV[0-9A-Za-z]{10})\b/;
const BILIBILI_AID_PATTERN = /\/video\/av(\d+)/i;
const YOUTUBE_VIDEO_ID_PATTERN = /^[0-9A-Za-z_-]{11}$/;

export interface RssVideoPresentation {
  embedUrl?: string;
  imageUrl?: string;
  provider?: 'bilibili' | 'youtube';
}

export function normalizeRssImageUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && /(^|\.)hdslb\.com$/i.test(url.hostname)) {
      url.protocol = 'https:';
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function youtubeVideoId(item: RssItem) {
  const storedId = item.id.match(/(?:^|:)youtube:([0-9A-Za-z_-]{11})(?:$|:)/)?.[1];
  if (storedId) return storedId;
  try {
    const url = new URL(item.link);
    if (!/(^|\.)youtube\.com$/i.test(url.hostname) && !/(^|\.)youtu\.be$/i.test(url.hostname)) return '';
    const candidate = url.hostname.endsWith('youtu.be')
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
    return candidate && YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : '';
  } catch {
    return '';
  }
}

function bilibiliVideoId(item: RssItem) {
  const bvid = `${item.id} ${item.link}`.match(BILIBILI_BVID_PATTERN)?.[1];
  if (bvid) return { bvid };
  try {
    const aid = new URL(item.link).pathname.match(BILIBILI_AID_PATTERN)?.[1];
    return aid ? { aid } : undefined;
  } catch {
    return undefined;
  }
}

export function getRssVideoPresentation(item: RssItem, feed?: RssFeed): RssVideoPresentation | undefined {
  if (feed?.type !== 'video') return undefined;
  const imageUrl = normalizeRssImageUrl(item.imageUrl);
  const bilibiliId = bilibiliVideoId(item);
  if (bilibiliId) {
    const search = new URLSearchParams({ autoplay: '0', page: '1' });
    if (bilibiliId.bvid) search.set('bvid', bilibiliId.bvid);
    else if (bilibiliId.aid) search.set('aid', bilibiliId.aid);
    return {
      provider: 'bilibili',
      imageUrl,
      embedUrl: `https://player.bilibili.com/player.html?${search.toString()}`,
    };
  }
  const videoId = youtubeVideoId(item);
  if (videoId) {
    return {
      provider: 'youtube',
      imageUrl: imageUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
    };
  }
  return imageUrl ? { imageUrl } : undefined;
}

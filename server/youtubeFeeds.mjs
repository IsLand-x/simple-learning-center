import { fetchRssFeed } from './rss.mjs';
import { sourceError } from './rssSourceErrors.mjs';
import {
  getYouTubeClient,
  youtubeFetch,
  youtubeTransportError,
} from './youtubeClient.mjs';

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
]);

function cleanInput(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048) {
    throw sourceError(400, 'YOUTUBE_CHANNEL_NOT_FOUND', '请输入有效的 YouTube 频道地址、@handle 或频道 ID');
  }
  return value.trim();
}

function channelIdFromEndpoint(endpoint) {
  const candidates = [
    endpoint?.payload?.browseId,
    endpoint?.payload?.browse_id,
    endpoint?.command?.browse_id,
    endpoint?.command?.browseId,
  ];
  return candidates.find((candidate) => CHANNEL_ID_PATTERN.test(String(candidate ?? ''))) || '';
}

export function parseYouTubeChannelInput(value) {
  const input = cleanInput(value);
  if (CHANNEL_ID_PATTERN.test(input)) return { channelId: input };

  if (input.startsWith('@')) {
    if (/\s|\//.test(input) || input.length > 101) {
      throw sourceError(400, 'YOUTUBE_CHANNEL_NOT_FOUND', 'YouTube 频道 handle 不正确');
    }
    return { resolveUrl: `https://www.youtube.com/${input}` };
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    throw sourceError(400, 'YOUTUBE_CHANNEL_NOT_FOUND', '请输入完整的 YouTube 频道地址、@handle 或频道 ID');
  }
  if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) {
    throw sourceError(400, 'YOUTUBE_CHANNEL_NOT_FOUND', '目前只支持 YouTube HTTPS 频道地址');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'channel' && CHANNEL_ID_PATTERN.test(segments[1] ?? '')) {
    return { channelId: segments[1] };
  }
  if (segments[0]?.startsWith('@')) {
    return { resolveUrl: `https://www.youtube.com/${segments[0]}` };
  }
  throw sourceError(400, 'YOUTUBE_CHANNEL_NOT_FOUND', '无法从地址中识别 YouTube 频道');
}

export async function resolveYouTubeChannel(value, { getClient = getYouTubeClient } = {}) {
  const parsed = parseYouTubeChannelInput(value);
  let channelId = parsed.channelId;
  if (!channelId) {
    try {
      const youtube = await getClient();
      channelId = channelIdFromEndpoint(await youtube.resolveURL(parsed.resolveUrl));
    } catch (error) {
      const transportFailure = youtubeTransportError(error);
      if (transportFailure) throw transportFailure;
      throw sourceError(422, 'YOUTUBE_CHANNEL_NOT_FOUND', '无法识别这个 YouTube 频道，请检查频道地址或 handle');
    }
  }
  if (!CHANNEL_ID_PATTERN.test(channelId ?? '')) {
    throw sourceError(422, 'YOUTUBE_CHANNEL_NOT_FOUND', 'YouTube 没有返回有效的频道 ID');
  }
  return {
    kind: 'youtube-channel',
    channelId,
    feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
  };
}

export function youtubeVideoIdFromUrl(value) {
  try {
    const url = new URL(value);
    const candidate = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).at(-1) || '';
    return VIDEO_ID_PATTERN.test(candidate) ? candidate : '';
  } catch {
    return '';
  }
}

export async function fetchYouTubeChannelFeed(source, {
  fetchImpl = youtubeFetch,
  fetchFeed = fetchRssFeed,
} = {}) {
  if (!source || source.kind !== 'youtube-channel' || !CHANNEL_ID_PATTERN.test(source.channelId ?? '')) {
    throw sourceError(400, 'YOUTUBE_CHANNEL_NOT_FOUND', 'YouTube 频道配置不正确');
  }
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`;
  try {
    const result = await fetchFeed(feedUrl, { fetchImpl, onFetchError: youtubeTransportError });
    const items = result.items.map((item) => {
      const videoId = youtubeVideoIdFromUrl(item.link);
      return {
        ...item,
        id: videoId ? `youtube:${videoId}` : item.id,
      };
    });
    return {
      ...result,
      feedUrl: `https://www.youtube.com/channel/${source.channelId}`,
      siteUrl: result.siteUrl || `https://www.youtube.com/channel/${source.channelId}`,
      items,
    };
  } catch (error) {
    if (error?.sourceCode) throw error;
    if (error?.status === 504) {
      throw sourceError(504, 'UPSTREAM_TIMEOUT', error.message);
    }
    if (Number.isInteger(error?.status)) {
      if (error.status >= 500) throw sourceError(error.status, 'UPSTREAM_UNAVAILABLE', error.message);
      throw error;
    }
    const transportFailure = youtubeTransportError(error);
    if (transportFailure) throw transportFailure;
    throw sourceError(502, 'UPSTREAM_UNAVAILABLE', '暂时无法读取 YouTube 频道 Feed，请稍后重试');
  }
}

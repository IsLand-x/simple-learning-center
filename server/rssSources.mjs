import { z } from 'zod';
import { fetchRssFeed } from './rss.mjs';
import { fetchBilibiliUp, fetchBilibiliWeekly, parseBilibiliUpInput } from './bilibiliFeeds.mjs';
import { sourceError } from './rssSourceErrors.mjs';
import { sourceSecretsService } from './sourceSecrets.mjs';
import { fetchYouTubeChannelFeed, resolveYouTubeChannel } from './youtubeFeeds.mjs';

const rssSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rss'), feedUrl: z.string().min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal('bilibili-weekly') }).strict(),
  z.object({ kind: z.literal('bilibili-up'), uid: z.string().regex(/^\d{1,20}$/) }).strict(),
  z.object({
    kind: z.literal('youtube-channel'),
    channelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/),
    feedUrl: z.string().url().max(2_048),
  }).strict(),
]);

const resolveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rss'), input: z.string().min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal('bilibili-weekly') }).strict(),
  z.object({ kind: z.literal('bilibili-up'), input: z.string().min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal('youtube-channel'), input: z.string().min(1).max(2_048) }).strict(),
]);

function parsed(schema, value, message) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw sourceError(400, 'SOURCE_INPUT_INVALID', message);
}

export function normalizeRssSource(value, fallbackUrl = '') {
  if (value?.kind) return parsed(rssSourceSchema, value, '订阅源配置不正确');
  return parsed(rssSourceSchema, { kind: 'rss', feedUrl: fallbackUrl }, 'RSS / Atom 地址不正确');
}

export function sourceMinimumIntervalMs(source) {
  switch (source?.kind) {
    case 'bilibili-weekly': return 6 * 60 * 60 * 1_000;
    case 'bilibili-up': return 60 * 60 * 1_000;
    case 'youtube-channel': return 30 * 60 * 1_000;
    default: return 0;
  }
}

export async function fetchRssSource(value, {
  rssFetcher = fetchRssFeed,
  bilibiliWeeklyFetcher = fetchBilibiliWeekly,
  bilibiliUpFetcher = fetchBilibiliUp,
  youtubeChannelFetcher = fetchYouTubeChannelFeed,
  secrets = sourceSecretsService,
} = {}) {
  const source = normalizeRssSource(value);
  switch (source.kind) {
    case 'rss': return rssFetcher(source.feedUrl);
    case 'bilibili-weekly': return bilibiliWeeklyFetcher();
    case 'bilibili-up':
      return bilibiliUpFetcher(source.uid, { getCookie: () => secrets.getBilibiliCookie() });
    case 'youtube-channel': return youtubeChannelFetcher(source);
  }
}

export async function resolveRssSource(value, {
  rssFetcher = fetchRssFeed,
  bilibiliWeeklyFetcher = fetchBilibiliWeekly,
  bilibiliUpFetcher = fetchBilibiliUp,
  youtubeResolver = resolveYouTubeChannel,
  youtubeChannelFetcher = fetchYouTubeChannelFeed,
  secrets = sourceSecretsService,
} = {}) {
  const input = parsed(resolveSchema, value, '订阅源类型或地址不正确');
  if (input.kind === 'rss') {
    const result = await rssFetcher(input.input);
    return { source: { kind: 'rss', feedUrl: result.feedUrl }, result };
  }
  if (input.kind === 'bilibili-weekly') {
    return { source: { kind: 'bilibili-weekly' }, result: await bilibiliWeeklyFetcher() };
  }
  if (input.kind === 'bilibili-up') {
    const uid = parseBilibiliUpInput(input.input);
    const source = { kind: 'bilibili-up', uid };
    return {
      source,
      result: await bilibiliUpFetcher(uid, { getCookie: () => secrets.getBilibiliCookie() }),
    };
  }
  const resolved = await youtubeResolver(input.input);
  const source = {
    kind: 'youtube-channel',
    channelId: resolved.channelId,
    feedUrl: resolved.feedUrl,
  };
  return { source, result: await youtubeChannelFetcher(source) };
}

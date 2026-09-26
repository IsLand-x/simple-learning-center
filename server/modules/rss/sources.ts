import type { RssSource } from '../../../contracts/rss.js';
import type { FetchedRssFeed } from './types.js';
import { z } from 'zod';
import { fetchRssFeed } from './feed.js';
import {
  fetchBilibiliUp,
  fetchBilibiliWeekly,
  parseBilibiliUpInput,
} from './providers/bilibili.js';
import { sourceError } from './errors.js';
import { sourceSecretsService } from '../settings/sourceSecrets.js';
import { fetchYouTubeChannelFeed, resolveYouTubeChannel } from './providers/youtube.js';

const rssSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rss'), feedUrl: z.string().min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal('bilibili-weekly') }).strict(),
  z.object({ kind: z.literal('bilibili-up'), uid: z.string().regex(/^\d{1,20}$/) }).strict(),
  z
    .object({
      kind: z.literal('youtube-channel'),
      channelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/),
      feedUrl: z.string().url().max(2_048),
    })
    .strict(),
]);

const resolveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rss'), input: z.string().min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal('bilibili-weekly') }).strict(),
  z.object({ kind: z.literal('bilibili-up'), input: z.string().min(1).max(2_048) }).strict(),
  z.object({ kind: z.literal('youtube-channel'), input: z.string().min(1).max(2_048) }).strict(),
]);

function parsed<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  message: string,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw sourceError(400, 'SOURCE_INPUT_INVALID', message);
}

export function normalizeRssSource(value: unknown, fallbackUrl = ''): RssSource {
  if ((value as { kind?: unknown } | null | undefined)?.kind)
    return parsed(rssSourceSchema, value, '订阅源配置不正确');
  return parsed(rssSourceSchema, { kind: 'rss', feedUrl: fallbackUrl }, 'RSS / Atom 地址不正确');
}

export function sourceMinimumIntervalMs(source: RssSource | undefined | null) {
  switch (source?.kind) {
    case 'bilibili-weekly':
      return 6 * 60 * 60 * 1_000;
    case 'bilibili-up':
      return 60 * 60 * 1_000;
    case 'youtube-channel':
      return 30 * 60 * 1_000;
    default:
      return 0;
  }
}

export async function fetchRssSource(
  value: unknown,
  {
    rssFetcher = fetchRssFeed,
    bilibiliWeeklyFetcher = fetchBilibiliWeekly,
    bilibiliUpFetcher = fetchBilibiliUp,
    youtubeChannelFetcher = fetchYouTubeChannelFeed,
    secrets = sourceSecretsService,
  }: FetchSourceOptions = {},
): Promise<FetchedRssFeed> {
  const source = normalizeRssSource(value);
  switch (source.kind) {
    case 'rss':
      return rssFetcher(source.feedUrl);
    case 'bilibili-weekly':
      return bilibiliWeeklyFetcher();
    case 'bilibili-up':
      return bilibiliUpFetcher(source.uid, { getCookie: () => secrets.getBilibiliCookie() });
    case 'youtube-channel':
      return youtubeChannelFetcher(source);
  }
}

export async function resolveRssSource(
  value: unknown,
  {
    rssFetcher = fetchRssFeed,
    bilibiliWeeklyFetcher = fetchBilibiliWeekly,
    bilibiliUpFetcher = fetchBilibiliUp,
    youtubeResolver = resolveYouTubeChannel,
    youtubeChannelFetcher = fetchYouTubeChannelFeed,
    secrets = sourceSecretsService,
  }: FetchSourceOptions & { youtubeResolver?: typeof resolveYouTubeChannel } = {},
): Promise<{ source: RssSource; result: FetchedRssFeed }> {
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
    const source: RssSource = { kind: 'bilibili-up', uid };
    return {
      source,
      result: await bilibiliUpFetcher(uid, { getCookie: () => secrets.getBilibiliCookie() }),
    };
  }
  const resolved = await youtubeResolver(input.input);
  const source: RssSource = {
    kind: 'youtube-channel',
    channelId: resolved.channelId,
    feedUrl: resolved.feedUrl,
  };
  return { source, result: await youtubeChannelFetcher(source) };
}

interface FetchSourceOptions {
  rssFetcher?: typeof fetchRssFeed;
  bilibiliWeeklyFetcher?: typeof fetchBilibiliWeekly;
  bilibiliUpFetcher?: typeof fetchBilibiliUp;
  youtubeChannelFetcher?: typeof fetchYouTubeChannelFeed;
  secrets?: Pick<typeof sourceSecretsService, 'getBilibiliCookie'>;
}

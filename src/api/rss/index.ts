import type {
  FetchRssArticleRequest,
  FetchRssSourceRequest,
  FetchedRssArticle,
  FetchedRssFeed,
  GenerateRssDigestRequest,
  GenerateRssDigestResponse,
  ResolveRssSourceResponse,
  RssSourceInput,
} from './type';
import { apiTransport } from '../http/transport';

class RssApi {
  constructor(private readonly transport = apiTransport) {}

  resolveSource(input: RssSourceInput): Promise<ResolveRssSourceResponse> {
    return this.transport.json('/api/rss/sources/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  fetchSource(input: FetchRssSourceRequest): Promise<FetchedRssFeed> {
    return this.transport.json('/api/rss/sources/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  fetchArticle(input: FetchRssArticleRequest): Promise<FetchedRssArticle> {
    return this.transport.json('/api/rss/article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  generateDigest(input: GenerateRssDigestRequest): Promise<GenerateRssDigestResponse> {
    return this.transport.json('/api/rss/digests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
}

export const rssApi = new RssApi();

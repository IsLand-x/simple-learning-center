import { parseHTML } from 'linkedom';
import { z } from 'zod';
import type { DoubanBookInfo } from '../../../contracts/books.js';

const suggestionSchema = z.array(
  z.object({
    id: z.string().regex(/^\d{1,12}$/),
    title: z.string(),
    author_name: z.string().optional(),
    type: z.string(),
  }),
);
const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[[（(【][^\]）)】]*[\]）)】]/g, '')
    .replace(/(?:著|编著|编)$/u, '')
    .replace(/[\p{P}\p{Z}\p{S}]/gu, '')
    .toLowerCase();
const text = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

// Only public Douban endpoints are used; titles are never sent to a model or search proxy.
export class DoubanBookLookup {
  private readonly cache = new Map<string, { expires: number; result: Promise<DoubanBookInfo> }>();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {}

  lookup(title: string, author: string): Promise<DoubanBookInfo> {
    const key = JSON.stringify([title, author]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.result;
    // Bound cached entries; identical lookups share the same in-flight promise.
    if (this.cache.size >= 200) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    const entry = { expires: this.now() + 5 * 60_000, result: this.load(title, author) };
    this.cache.set(key, entry);
    void entry.result.then((result) => {
      entry.expires = this.now() + (result.status === 'matched' ? 24 * 60 * 60_000 : 5 * 60_000);
    });
    return entry.result;
  }

  private async read(url: string, limit: number): Promise<string> {
    const response = await this.fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(4_000),
      headers: {
        Accept: 'text/html,application/json',
        'User-Agent': 'LearningCenter/1.0 (public book metadata)',
      },
    });
    if (!response.ok || !response.body) throw new Error('豆瓣信息暂不可用');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let source = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error('豆瓣页面过大');
        source += decoder.decode(value, { stream: true });
      }
      return source + decoder.decode();
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  private async load(title: string, author: string): Promise<DoubanBookInfo> {
    const queryTitle = Array.from(title).slice(0, 200).join('');
    const searchUrl = `https://search.douban.com/book/subject_search?${new URLSearchParams({ search_text: queryTitle, cat: '1001' })}`;
    try {
      if (!normalize(author) || author === '未知作者') return { status: 'not_found', searchUrl };
      const suggestions = suggestionSchema.parse(
        JSON.parse(
          await this.read(
            `https://book.douban.com/j/subject_suggest?${new URLSearchParams({ q: queryTitle })}`,
            64_000,
          ),
        ),
      );
      const match = suggestions.find(
        (item) =>
          item.type === 'b' &&
          normalize(item.title) === normalize(title) &&
          normalize(item.author_name ?? '') === normalize(author),
      );
      if (!match) return { status: 'not_found', searchUrl };
      const url = `https://book.douban.com/subject/${match.id}/`;
      const { document } = parseHTML(await this.read(url, 512_000));
      const pageTitle = text(document.querySelector('[property="v:itemreviewed"]')?.textContent);
      const pageAuthors = Array.from(document.querySelectorAll('meta[property="book:author"]')).map(
        (element) => element.getAttribute('content') ?? '',
      );
      if (
        normalize(pageTitle) !== normalize(title) ||
        !pageAuthors.some((value) => normalize(value) === normalize(author))
      )
        return { status: 'unavailable', searchUrl };
      const introduction =
        document.querySelector('#link-report .all.hidden .intro') ??
        document.querySelector('#link-report .intro');
      const description = Array.from(introduction?.querySelectorAll('p') ?? [])
        .map((element) => text(element.textContent))
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 320);
      const ratingText = text(document.querySelector('[property="v:average"]')?.textContent);
      const rating =
        /^\d{1,2}(?:\.\d)?$/.test(ratingText) && Number(ratingText) <= 10
          ? Number(ratingText)
          : null;
      const reviews = Array.from(document.querySelectorAll('.review-list .review-item'))
        .flatMap((item) => {
          const link = item.querySelector('.main-bd h2 a');
          const id = /^https:\/\/book\.douban\.com\/review\/(\d{1,12})\/$/.exec(
            link?.getAttribute('href') ?? '',
          )?.[1];
          const reviewTitle = text(link?.textContent).slice(0, 160);
          return id && reviewTitle
            ? [
                {
                  title: reviewTitle,
                  author: text(item.querySelector('.main-hd .name')?.textContent).slice(0, 60),
                  url: `https://book.douban.com/review/${id}/`,
                },
              ]
            : [];
        })
        .slice(0, 3);
      return {
        status: 'matched',
        title: pageTitle,
        url,
        reviewsUrl: `${url}reviews`,
        description,
        rating,
        reviews,
        fetchedAt: this.now(),
      };
    } catch {
      return { status: 'unavailable', searchUrl };
    }
  }
}

export const doubanBooks = new DoubanBookLookup();

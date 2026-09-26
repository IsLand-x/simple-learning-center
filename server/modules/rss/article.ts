import type { WebSearchConfig } from '../../../contracts/settings.js';

interface ExtractedArticle {
  title?: string | null;
  byline?: string | null;
  excerpt?: string | null;
  content?: string | null;
  textContent?: string | null;
}
interface StructuredArticle {
  '@type'?: unknown;
  '@graph'?: unknown;
  articleBody?: unknown;
  headline?: unknown;
  name?: unknown;
  author?: unknown;
  description?: unknown;
}

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { statusError } from '../../infrastructure/http/errors.js';
import { validateRemoteUrl } from './feed.js';
import { readRenderedWebPageHtml } from '../../infrastructure/http/webSearch.js';

const ARTICLE_TIMEOUT_MS = 18_000;
const RENDERED_ARTICLE_TIMEOUT_MS = 45_000;
const MAX_ARTICLE_BYTES = 6 * 1024 * 1024;
const MAX_ARTICLE_CONTENT_LENGTH = 300_000;
const MAX_REDIRECTS = 5;

function compactText(value: unknown, maxLength = MAX_ARTICLE_CONTENT_LENGTH) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

async function responseText(response: Response) {
  if (!response.body) throw statusError(422, '原网页没有返回内容');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_ARTICLE_BYTES) {
      await response.body.cancel().catch(() => undefined);
      throw statusError(413, '原网页内容过大');
    }
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks, total);
  const contentType = response.headers.get('content-type') ?? '';
  const encoding = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || 'utf-8';
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function fetchArticleHtml(
  initialUrl: URL,
  { fetchImpl, validateUrl }: { fetchImpl: typeof fetch; validateUrl: typeof validateRemoteUrl },
) {
  let url = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'LearningCenterRSS/1.0',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS),
      });
    } catch (error) {
      if ((error as { name?: unknown } | null | undefined)?.name === 'TimeoutError')
        throw statusError(504, '获取原网页超时');
      throw statusError(502, '无法连接原网页');
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirectCount === MAX_REDIRECTS) throw statusError(502, '原网页重定向过多');
      url = await validateUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw statusError(502, `原网页返回了 HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw statusError(422, '原链接不是可读取的网页');
    }
    return { html: await responseText(response), url: url.href };
  }
  throw statusError(502, '原网页重定向过多');
}

function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function schemaTypes(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) =>
      String(item ?? '')
        .split('/')
        .at(-1)
        ?.toLocaleLowerCase(),
    )
    .filter((type): type is string => Boolean(type));
}

function schemaNodes(value: unknown): StructuredArticle[] {
  if (Array.isArray(value)) return value.flatMap(schemaNodes);
  if (!value || typeof value !== 'object') return [];
  const node = value as StructuredArticle;
  return [node, ...schemaNodes(node['@graph'])];
}

function authorNames(value: unknown) {
  const authors = Array.isArray(value) ? value : value ? [value] : [];
  return authors
    .map((author) =>
      typeof author === 'string' ? author : (author as { name?: unknown } | null)?.name,
    )
    .filter(Boolean)
    .join('、');
}

function structuredDataArticle(document: Document) {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let payload;
    try {
      payload = JSON.parse(script.textContent || '');
    } catch {
      continue;
    }
    const article = schemaNodes(payload).find(
      (node) =>
        schemaTypes(node['@type']).some(
          (type) => type === 'blogposting' || type.endsWith('article'),
        ) && compactText(node.articleBody).length >= 80,
    );
    if (!article) continue;
    const textContent = compactText(article.articleBody);
    const paragraphs = textContent.split(/\n{2,}/).filter(Boolean);
    return {
      title: compactText(article.headline || article.name, 1_000),
      byline: compactText(authorNames(article.author), 500),
      excerpt: compactText(article.description || textContent.slice(0, 240), 1_000),
      content: paragraphs
        .map((paragraph) => `<p>${htmlEscape(paragraph).replaceAll('\n', '<br>')}</p>`)
        .join(''),
      textContent,
    };
  }
  return null;
}

function fallbackArticle(document: Document) {
  const candidate = document.querySelector(
    'article, main, [role="main"], .post-content, .entry-content, .article-content',
  );
  if (!candidate) return null;
  const clone = candidate.cloneNode(true) as Element;
  clone
    .querySelectorAll('script, style, noscript, form, nav, header, footer, aside')
    .forEach((element) => element.remove());
  const textContent = compactText(clone.textContent);
  if (textContent.length < 80) return null;
  return {
    title: document.title || '',
    byline: '',
    excerpt: textContent.slice(0, 240),
    content: clone.innerHTML,
    textContent,
  };
}

function extractArticle(html: string) {
  const { document } = parseHTML(html);
  const structured = structuredDataArticle(document);
  const readable = new Readability(document, {
    charThreshold: 80,
    keepClasses: false,
  }).parse();
  if (readable?.content && compactText(readable.textContent)) return readable;
  if (structured?.content && structured.textContent) return structured;
  const { document: fallbackDocument } = parseHTML(html);
  return fallbackArticle(fallbackDocument);
}

function completedArticle(
  parsed: ExtractedArticle | null,
  { fallbackTitle = '', url }: { fallbackTitle?: string; url: string },
) {
  const contentHtml = String(parsed?.content ?? '').trim();
  const contentText = compactText(parsed?.textContent);
  if (!contentHtml || !contentText) return null;
  if (contentHtml.length > MAX_ARTICLE_CONTENT_LENGTH * 2)
    throw statusError(413, '提取后的原文内容过大');
  return {
    title: compactText(parsed?.title || fallbackTitle, 1_000),
    byline: compactText(parsed?.byline, 500),
    excerpt: compactText(parsed?.excerpt, 1_000),
    contentHtml,
    contentText,
    url,
    fetchedAt: Date.now(),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '未知错误';
}

/**
 * @param {unknown} value
 * @param {{ fetchImpl?: typeof fetch; readRenderedPage?: typeof readRenderedWebPageHtml; validateUrl?: typeof validateRemoteUrl; readerConfig?: import('../../../contracts/settings.js').WebSearchConfig }} [options]
 */
export async function fetchRssArticle(
  value: unknown,
  {
    fetchImpl = fetch,
    readRenderedPage = readRenderedWebPageHtml,
    readerConfig,
    validateUrl = validateRemoteUrl,
  }: {
    fetchImpl?: typeof fetch;
    readRenderedPage?: typeof readRenderedWebPageHtml;
    readerConfig?: WebSearchConfig;
    validateUrl?: typeof validateRemoteUrl;
  } = {},
) {
  const initialUrl = await validateUrl(value);
  let fetchedPage;
  let staticFetchError;
  try {
    fetchedPage = await fetchArticleHtml(initialUrl, { fetchImpl, validateUrl });
  } catch (error) {
    staticFetchError = error;
  }

  if (fetchedPage) {
    let article;
    try {
      article = completedArticle(extractArticle(fetchedPage.html), {
        url: fetchedPage.url,
      });
    } catch (error) {
      staticFetchError = error;
    }
    if (article) return article;
  }

  if (readerConfig?.apiKey?.trim()) {
    try {
      const targetUrl = fetchedPage?.url || initialUrl.href;
      const renderedPage = await readRenderedPage(
        readerConfig,
        targetUrl,
        AbortSignal.timeout(RENDERED_ARTICLE_TIMEOUT_MS),
      );
      const article = completedArticle(extractArticle(renderedPage.content), {
        fallbackTitle: renderedPage.title,
        url: targetUrl,
      });
      if (article) return article;
      throw new Error('渲染后仍未提取到可阅读正文');
    } catch (error) {
      throw statusError(502, `Jina Reader 读取失败：${errorMessage(error)}`);
    }
  }

  if (staticFetchError) throw staticFetchError;
  throw statusError(
    422,
    '没有从原网页中提取到正文；页面可能依赖 JavaScript，请先在设置页配置 Jina Reader 后重试',
  );
}

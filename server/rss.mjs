import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { DOMParser } from '@xmldom/xmldom';
import { statusError } from './errors.mjs';

const MAX_FEED_BYTES = 4 * 1024 * 1024;
const MAX_FEED_ITEMS = 120;
const MAX_REDIRECTS = 5;
const FEED_TIMEOUT_MS = 15_000;

function compactText(value, maxLength = 100_000) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function stripDoctype(value) {
  return value.replace(/<!DOCTYPE(?:[^>]|\[[\s\S]*?\]\s*)*>/gi, '');
}

function htmlToText(value) {
  const source = compactText(value);
  if (!source) return '';
  const errors = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(`<root>${stripDoctype(source)}</root>`, 'text/xml');
  if (!document?.documentElement || errors.length) {
    return compactText(source.replace(/<[^>]+>/g, ' '));
  }
  return compactText(document.documentElement.textContent);
}

function localName(node) {
  return String(node?.localName || node?.nodeName || '').split(':').at(-1).toLocaleLowerCase();
}

function elementChildren(node) {
  return Array.from(node?.childNodes ?? []).filter((child) => child.nodeType === 1);
}

function directChild(node, names) {
  const accepted = new Set(names.map((name) => name.toLocaleLowerCase()));
  return elementChildren(node).find((child) => accepted.has(localName(child)));
}

function descendants(node, names) {
  const accepted = new Set(names.map((name) => name.toLocaleLowerCase()));
  const matches = [];
  const visit = (parent) => {
    for (const child of elementChildren(parent)) {
      if (accepted.has(localName(child))) matches.push(child);
      visit(child);
    }
  };
  visit(node);
  return matches;
}

function firstDescendant(node, names) {
  return descendants(node, names)[0];
}

function childText(node, names, maxLength) {
  for (const name of names) {
    const normalized = name.toLocaleLowerCase();
    const element = elementChildren(node).find((child) => localName(child) === normalized)
      || firstDescendant(node, [normalized]);
    if (element) return compactText(element.textContent, maxLength);
  }
  return '';
}

function absoluteUrl(value, baseUrl) {
  const source = compactText(value, 4_000);
  if (!source) return '';
  try {
    const url = new URL(source, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function atomLink(node, baseUrl) {
  const links = elementChildren(node).filter((child) => localName(child) === 'link');
  const preferred = links.find((link) => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate')
    || links[0];
  return absoluteUrl(preferred?.getAttribute('href') || preferred?.textContent, baseUrl);
}

function itemLink(node, baseUrl) {
  const link = directChild(node, ['link']);
  return absoluteUrl(link?.getAttribute('href') || link?.textContent, baseUrl)
    || atomLink(node, baseUrl);
}

function decodedHtmlUrl(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&#38;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function contentImages(value, baseUrl) {
  const images = [];
  const pattern = /<img\b[^>]*\b(?:src|data-src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gi;
  let match = pattern.exec(String(value ?? ''));
  while (match && images.length < 20) {
    const url = absoluteUrl(decodedHtmlUrl(match[1] || match[2] || match[3]), baseUrl);
    if (url && !images.includes(url)) images.push(url);
    match = pattern.exec(String(value ?? ''));
  }
  return images;
}

function itemImages(node, rawContent, baseUrl) {
  const candidates = descendants(node, ['thumbnail', 'content', 'enclosure', 'image']);
  const mediaImages = candidates.flatMap((element) => {
    const url = element.getAttribute('url') || element.getAttribute('href');
    const type = element.getAttribute('type') || '';
    const nestedUrl = localName(element) === 'image' ? childText(element, ['url'], 4_000) : '';
    if ((!url && !nestedUrl) || (type && !type.startsWith('image/'))) return [];
    const absolute = absoluteUrl(url || nestedUrl, baseUrl);
    return absolute ? [absolute] : [];
  });
  return [...new Set([...mediaImages, ...contentImages(rawContent, baseUrl)])].slice(0, 20);
}

function parseTimestamp(value, fallback) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableItemId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function feedItem(node, baseUrl, fetchedAt) {
  const title = childText(node, ['title'], 1_000) || '未命名内容';
  const link = itemLink(node, baseUrl);
  const guid = childText(node, ['guid', 'id'], 4_000);
  const publishedText = childText(node, ['published', 'pubdate', 'updated', 'date'], 500);
  const rawContent = childText(node, ['encoded', 'content', 'description', 'summary'], 200_000);
  const authorNode = directChild(node, ['author', 'creator']) || firstDescendant(node, ['author', 'creator']);
  const author = localName(authorNode) === 'author'
    ? childText(authorNode, ['name'], 500) || compactText(authorNode?.textContent, 500)
    : compactText(authorNode?.textContent, 500);
  const identity = guid || link || `${title}\n${publishedText}`;
  const imageUrls = itemImages(node, rawContent, baseUrl);
  return {
    id: stableItemId(identity),
    title,
    link,
    author,
    publishedAt: parseTimestamp(publishedText, fetchedAt),
    contentText: htmlToText(rawContent).slice(0, 100_000),
    contentHtml: rawContent,
    imageUrl: imageUrls[0],
    imageUrls,
  };
}

function parseDocument(xml) {
  const errors = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(stripDoctype(xml), 'text/xml');
  if (!document?.documentElement || errors.length) {
    throw statusError(422, '订阅源 XML 无法解析');
  }
  return document;
}

export function parseRssFeed(xml, feedUrl, fetchedAt = Date.now()) {
  if (typeof xml !== 'string' || !xml.trim()) throw statusError(422, '订阅源内容为空');
  const document = parseDocument(xml);
  const root = document.documentElement;
  const rootName = localName(root);
  const atom = rootName === 'feed';
  const channel = atom ? root : directChild(root, ['channel']) || root;
  const itemNodes = atom ? elementChildren(root).filter((child) => localName(child) === 'entry') : descendants(channel, ['item']);
  if (!itemNodes.length && !['rss', 'rdf', 'feed'].includes(rootName)) {
    throw statusError(422, '这不是可识别的 RSS 或 Atom 订阅源');
  }
  const title = childText(channel, ['title'], 1_000) || new URL(feedUrl).hostname;
  const description = htmlToText(childText(channel, ['description', 'subtitle'], 20_000));
  const siteUrl = atom ? atomLink(channel, feedUrl) : absoluteUrl(childText(channel, ['link'], 4_000), feedUrl);
  const seen = new Set();
  const items = itemNodes
    .slice(0, MAX_FEED_ITEMS)
    .map((node) => feedItem(node, feedUrl, fetchedAt))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((left, right) => right.publishedAt - left.publishedAt);
  return {
    title,
    description,
    siteUrl,
    feedUrl,
    fetchedAt,
    items,
  };
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;
  const normalized = address.toLocaleLowerCase();
  if (normalized.startsWith('::ffff:')) return isPrivateIpv4(normalized.slice('::ffff:'.length));
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff');
}

export async function validateRemoteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw statusError(400, '订阅源地址格式不正确');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw statusError(400, '订阅源必须使用不含账号信息的 HTTP 或 HTTPS 地址');
  }
  const hostname = url.hostname.toLocaleLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw statusError(400, '订阅源不能指向本机或局域网地址');
  }
  let addresses;
  try {
    addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw statusError(422, '无法解析订阅源域名');
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw statusError(400, '订阅源不能指向本机或局域网地址');
  }
  return url;
}

async function responseBytes(response) {
  if (!response.body) throw statusError(422, '订阅源没有返回内容');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_FEED_BYTES) {
      await response.body.cancel().catch(() => undefined);
      throw statusError(413, '订阅源内容过大');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

function decodeFeed(buffer) {
  const declaration = buffer.subarray(0, 240).toString('ascii');
  const encoding = declaration.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1] || 'utf-8';
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export async function fetchRssFeed(value) {
  let url = await validateRemoteUrl(value);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*;q=0.2',
          'User-Agent': 'LearningCenterRSS/1.0',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError') throw statusError(504, '获取订阅源超时');
      throw statusError(502, '无法连接订阅源');
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirectCount === MAX_REDIRECTS) throw statusError(502, '订阅源重定向过多');
      url = await validateRemoteUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw statusError(502, `订阅源返回了 HTTP ${response.status}`);
    }
    const bytes = await responseBytes(response);
    return parseRssFeed(decodeFeed(bytes), url.href);
  }
  throw statusError(502, '订阅源重定向过多');
}

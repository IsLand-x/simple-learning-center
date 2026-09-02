import { normalizeRssImageUrl } from './rssVideo';

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'details',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

const REMOVE_WITH_CONTENT = new Set([
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'math',
  'noscript',
  'object',
  'script',
  'style',
  'svg',
  'template',
]);

const GLOBAL_ATTRIBUTES = new Set(['dir', 'lang', 'title']);
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href']),
  details: new Set(['open']),
  img: new Set(['alt', 'data-src', 'height', 'src', 'width']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
};

interface RssContentAnnotation {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  prefix?: string;
  suffix?: string;
  kind: 'highlight' | 'comment';
}

function safeUrl(value: string | null, baseUrl: string, protocols: Set<string>) {
  if (!value) return '';
  try {
    const url = new URL(value, baseUrl);
    return protocols.has(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
}

export interface RssSearchMatch {
  start: number;
  end: number;
}

export interface RssContentHeading {
  id: string;
  level: number;
  text: string;
}

export function extractRssContentHeadings(value: string): RssContentHeading[] {
  if (!value) return [];
  const document = new DOMParser().parseFromString(value, 'text/html');
  return Array.from(document.body.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]'))
    .map((heading) => ({
      id: heading.id,
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent?.trim() ?? '',
    }))
    .filter((heading) => heading.text);
}

export function removeRssLeadingCover(value: string, coverUrl?: string) {
  const normalizedCoverUrl = normalizeRssImageUrl(coverUrl);
  if (!value || !normalizedCoverUrl) return value;
  const document = new DOMParser().parseFromString(value, 'text/html');
  const image = Array.from(document.body.querySelectorAll<HTMLImageElement>('img[data-rss-content-image="true"]'))
    .find((candidate) => normalizeRssImageUrl(candidate.src) === normalizedCoverUrl);
  if (!image) return value;
  const container = image.parentElement;
  const isStandaloneContainer = container
    && (container.tagName === 'P' || container.tagName === 'FIGURE')
    && !container.textContent?.trim()
    && container.querySelectorAll('img').length === 1;
  if (isStandaloneContainer) container.remove();
  else image.remove();
  return document.body.innerHTML;
}

export function findRssSearchMatches(value: string, query: string): RssSearchMatch[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(value.matchAll(new RegExp(escapedQuery, 'giu')), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function highlightSearchMatches(document: Document, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return;
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, 4);
  let node = walker.nextNode();

  while (node) {
    if (node instanceof Text && node.data && !node.parentElement?.closest('mark')) textNodes.push(node);
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const matches = findRssSearchMatches(textNode.data, normalizedQuery);
    if (!matches.length || !textNode.parentNode) return;
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    matches.forEach((match) => {
      if (match.start > cursor) fragment.append(document.createTextNode(textNode.data.slice(cursor, match.start)));
      const marker = document.createElement('mark');
      marker.className = 'rss-search-highlight';
      marker.textContent = textNode.data.slice(match.start, match.end);
      fragment.append(marker);
      cursor = match.end;
    });

    if (cursor < textNode.data.length) fragment.append(document.createTextNode(textNode.data.slice(cursor)));
    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

function resolvedAnnotationRange(value: string, annotation: RssContentAnnotation) {
  const start = Math.max(0, annotation.startOffset);
  const end = Math.min(value.length, annotation.endOffset);
  if (end > start && value.slice(start, end) === annotation.text) return { start, end };
  if (!annotation.text) return null;
  const candidates: number[] = [];
  let cursor = value.indexOf(annotation.text);
  while (cursor >= 0 && candidates.length < 100) {
    candidates.push(cursor);
    cursor = value.indexOf(annotation.text, cursor + annotation.text.length);
  }
  if (!candidates.length) return null;
  const matched = candidates.find((index) => (
    (!annotation.prefix || value.slice(Math.max(0, index - annotation.prefix.length), index) === annotation.prefix)
    && (!annotation.suffix || value.slice(index + annotation.text.length, index + annotation.text.length + annotation.suffix.length) === annotation.suffix)
  )) ?? candidates[0];
  return { start: matched, end: matched + annotation.text.length };
}

function applyAnnotations(document: Document, annotations: RssContentAnnotation[]) {
  if (!annotations.length) return;
  const bodyText = document.body.textContent ?? '';
  const ranges = annotations
    .map((annotation) => {
      const range = resolvedAnnotationRange(bodyText, annotation);
      return range ? { ...annotation, ...range } : null;
    })
    .filter((annotation): annotation is RssContentAnnotation & { start: number; end: number } => Boolean(annotation))
    .sort((left, right) => left.start - right.start);
  if (!ranges.length) return;

  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(document.body, 4);
  let node = walker.nextNode();
  let offset = 0;
  while (node) {
    if (node instanceof Text) {
      textNodes.push({ node, start: offset, end: offset + node.data.length });
      offset += node.data.length;
    }
    node = walker.nextNode();
  }

  textNodes.forEach(({ node: textNode, start: nodeStart, end: nodeEnd }) => {
    const intersections = ranges.filter((range) => range.start < nodeEnd && range.end > nodeStart);
    if (!intersections.length || !textNode.parentNode) return;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    intersections.forEach((annotation) => {
      const localStart = Math.max(0, annotation.start - nodeStart);
      const localEnd = Math.min(textNode.data.length, annotation.end - nodeStart);
      if (localStart > cursor) fragment.append(document.createTextNode(textNode.data.slice(cursor, localStart)));
      const marker = document.createElement('span');
      marker.className = `rss-persistent-highlight${annotation.kind === 'comment' ? ' rss-persistent-highlight--comment' : ''}`;
      marker.dataset.rssAnnotationId = annotation.id;
      marker.setAttribute('role', 'button');
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', annotation.kind === 'comment' ? '已评论内容' : '已高亮内容');
      marker.textContent = textNode.data.slice(localStart, localEnd);
      fragment.append(marker);
      cursor = localEnd;
    });
    if (cursor < textNode.data.length) fragment.append(document.createTextNode(textNode.data.slice(cursor)));
    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

export function sanitizeRssContentHtml(
  value: string | undefined,
  baseUrl: string,
  highlightQuery = '',
  annotations: RssContentAnnotation[] = [],
) {
  const source = value?.trim();
  if (!source) return '';
  const document = new DOMParser().parseFromString(source.includes('<') ? source : '', 'text/html');
  if (!source.includes('<')) {
    source.split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
      const element = document.createElement('p');
      element.textContent = paragraph;
      document.body.append(element);
    });
  }
  const elements = Array.from(document.body.querySelectorAll('*')).reverse();

  elements.forEach((element) => {
    const tag = element.tagName.toLocaleLowerCase();
    if (REMOVE_WITH_CONTENT.has(tag)) {
      element.remove();
      return;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      unwrapElement(element);
      return;
    }

    const tagAttributes = TAG_ATTRIBUTES[tag] ?? new Set<string>();
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLocaleLowerCase();
      if (!GLOBAL_ATTRIBUTES.has(name) && !tagAttributes.has(name)) element.removeAttribute(attribute.name);
    });

    if (tag === 'a') {
      const href = safeUrl(element.getAttribute('href'), baseUrl, LINK_PROTOCOLS);
      if (!href) {
        element.removeAttribute('href');
        return;
      }
      element.setAttribute('href', href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }

    if (tag === 'img') {
      const src = normalizeRssImageUrl(safeUrl(
        element.getAttribute('src') || element.getAttribute('data-src'),
        baseUrl,
        IMAGE_PROTOCOLS,
      ));
      if (!src) {
        element.remove();
        return;
      }
      const alt = element.getAttribute('alt')?.trim() || '文章图片';
      element.setAttribute('src', src);
      element.setAttribute('alt', alt);
      element.setAttribute('aria-label', `查看大图：${alt}`);
      element.setAttribute('data-rss-content-image', 'true');
      element.setAttribute('decoding', 'async');
      element.setAttribute('loading', 'lazy');
      element.setAttribute('referrerpolicy', 'no-referrer');
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.removeAttribute('data-src');
    }
  });

  Array.from(document.body.querySelectorAll<HTMLElement>('h1, h2, h3')).forEach((heading, index) => {
    heading.id = `rss-section-${index + 1}`;
  });

  applyAnnotations(document, annotations);
  highlightSearchMatches(document, highlightQuery);

  return document.body.innerHTML;
}

import { parseHTML } from 'linkedom';

const MAX_SOURCE_CHARACTERS = 30_000;
const MAX_SEGMENTS = 800;
const MAX_SEGMENT_CHARACTERS = 4_000;
const MAX_TRANSLATED_CHARACTERS = 120_000;
const TEXT_BLOCK_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, li, figcaption, th, td';
const SKIPPED_TAGS = new Set([
  'BUTTON',
  'CODE',
  'FORM',
  'IFRAME',
  'MATH',
  'NOSCRIPT',
  'OBJECT',
  'PRE',
  'SCRIPT',
  'STYLE',
  'SVG',
  'TEMPLATE',
  'TEXTAREA',
]);

function createDocument(html) {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  document.body.innerHTML = html;
  return document;
}

function sourceHtml(item) {
  const html = item?.fullContentHtml || item?.contentHtml;
  if (typeof html === 'string' && html.trim()) return html;
  const text = item?.fullContentText || item?.contentText;
  if (typeof text !== 'string' || !text.trim()) return '';
  const document = createDocument('');
  text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).forEach((paragraph) => {
    const element = document.createElement('p');
    element.textContent = paragraph;
    document.body.append(element);
  });
  return document.body.innerHTML;
}

function hasSkippedAncestor(node) {
  let parent = node.parentNode;
  while (parent && parent.nodeType !== 9) {
    if (parent.nodeType === 1 && SKIPPED_TAGS.has(parent.tagName)) return true;
    parent = parent.parentNode;
  }
  return false;
}

function collectTextNodes(root) {
  const nodes = [];
  const visit = (node) => {
    if (node.nodeType === 3) {
      if (node.data.trim() && !hasSkippedAncestor(node)) nodes.push(node);
      return;
    }
    if (node.nodeType !== 1 && node !== root) return;
    Array.from(node.childNodes || []).forEach(visit);
  };
  visit(root);
  return nodes;
}

function coreRange(value) {
  const leadingLength = value.match(/^\s*/u)?.[0].length ?? 0;
  const trailingLength = value.match(/\s*$/u)?.[0].length ?? 0;
  return {
    start: leadingLength,
    end: Math.max(leadingLength, value.length - trailingLength),
  };
}

function nextChunkEnd(value, start) {
  let hardEnd = Math.min(value.length, start + MAX_SEGMENT_CHARACTERS);
  if (
    hardEnd < value.length
    && /[\uD800-\uDBFF]/u.test(value[hardEnd - 1])
    && /[\uDC00-\uDFFF]/u.test(value[hardEnd])
  ) {
    hardEnd -= 1;
  }
  if (hardEnd === value.length) return hardEnd;
  const candidate = value.slice(start, hardEnd);
  const boundary = Math.max(
    candidate.lastIndexOf('\n'),
    candidate.lastIndexOf('。'),
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf(' '),
  );
  return boundary >= Math.floor(MAX_SEGMENT_CHARACTERS / 2)
    ? start + boundary + 1
    : hardEnd;
}

export function prepareRssTranslationSource(item) {
  const html = sourceHtml(item);
  if (!html) throw new Error('当前 RSS 内容没有可翻译的正文');
  const document = createDocument(html);
  const textNodes = collectTextNodes(document.body);
  const segments = [];
  let totalCharacters = 0;

  textNodes.some((node, nodeIndex) => {
    const range = coreRange(node.data);
    let start = range.start;
    while (
      start < range.end
      && segments.length < MAX_SEGMENTS
      && totalCharacters < MAX_SOURCE_CHARACTERS
    ) {
      const remainingBudget = MAX_SOURCE_CHARACTERS - totalCharacters;
      const end = Math.min(range.end, nextChunkEnd(node.data.slice(0, range.end), start), start + remainingBudget);
      if (end <= start) break;
      const text = node.data.slice(start, end);
      segments.push({
        id: `t${segments.length + 1}`,
        text,
        nodeIndex,
        start,
        end,
      });
      totalCharacters += text.length;
      start = end;
    }
    return segments.length >= MAX_SEGMENTS || totalCharacters >= MAX_SOURCE_CHARACTERS;
  });

  if (!segments.length) throw new Error('当前 RSS 内容没有可翻译的文本');
  return {
    html,
    segments,
    truncated: totalCharacters >= MAX_SOURCE_CHARACTERS || segments.length >= MAX_SEGMENTS,
  };
}

function responseJson(value) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  if (fenced) return fenced[1];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export function parseRssTranslationResponse(value, source) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('模型没有返回翻译结果');
  let parsed;
  try {
    parsed = JSON.parse(responseJson(value));
  } catch {
    throw new Error('模型返回的翻译格式不正确，请重试');
  }
  if (parsed?.version !== 1 || !Array.isArray(parsed.segments)) {
    throw new Error('模型返回的翻译格式不正确，请重试');
  }
  const expectedIds = new Set(source.segments.map((segment) => segment.id));
  const translations = new Map();
  let translatedCharacters = 0;
  for (const segment of parsed.segments) {
    if (
      !segment
      || typeof segment.id !== 'string'
      || !expectedIds.has(segment.id)
      || translations.has(segment.id)
      || typeof segment.text !== 'string'
    ) {
      throw new Error('模型返回的翻译片段不完整，请重试');
    }
    translatedCharacters += segment.text.length;
    if (translatedCharacters > MAX_TRANSLATED_CHARACTERS) {
      throw new Error('模型返回的翻译内容过长，请重试');
    }
    translations.set(segment.id, segment.text);
  }
  if (translations.size !== expectedIds.size) {
    throw new Error('模型返回的翻译片段不完整，请重试');
  }
  return translations;
}

export function renderRssTranslation(source, translations) {
  const document = createDocument(source.html);
  const textNodes = collectTextNodes(document.body);
  const segmentsByNode = new Map();
  source.segments.forEach((segment) => {
    const entries = segmentsByNode.get(segment.nodeIndex) || [];
    entries.push(segment);
    segmentsByNode.set(segment.nodeIndex, entries);
  });

  for (const [nodeIndex, segments] of segmentsByNode) {
    const node = textNodes[nodeIndex];
    if (!node) throw new Error('RSS 原文结构已经变化，请重新发起翻译');
    segments.sort((left, right) => right.start - left.start).forEach((segment) => {
      const translatedText = translations.get(segment.id);
      if (typeof translatedText !== 'string') throw new Error('模型返回的翻译片段不完整，请重试');
      if (node.data.slice(segment.start, segment.end) !== segment.text) {
        throw new Error('RSS 原文结构已经变化，请重新发起翻译');
      }
      node.data = `${node.data.slice(0, segment.start)}${translatedText}${node.data.slice(segment.end)}`;
    });
  }

  const blocks = Array.from(document.body.querySelectorAll(TEXT_BLOCK_SELECTOR))
    .filter((element) => !element.parentElement?.closest(TEXT_BLOCK_SELECTOR))
    .map((element) => element.textContent.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const text = blocks.length
    ? blocks.join('\n\n')
    : document.body.textContent.replace(/\s+/gu, ' ').trim();

  return {
    html: document.body.innerHTML,
    text,
  };
}

export function completeRssTranslation(value, source) {
  return renderRssTranslation(source, parseRssTranslationResponse(value, source));
}

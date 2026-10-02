import type { RssFeedType } from '../../../../../contracts/rss';

export const feedTypeLabels: Record<RssFeedType, string> = {
  article: '文章',
  video: '视频',
  social: '社交媒体',
};

const DIGEST_MARKDOWN_CHARACTERS = new Set(['#', '*', '_', '>', '`', '[', ']', '(', ')']);

export function digestPreview(content: string) {
  return [...content]
    .filter((character) => !DIGEST_MARKDOWN_CHARACTERS.has(character))
    .join('')
    .replace(/\s+/g, ' ')
    .slice(0, 92);
}

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function localDateKey(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleDateString('en-CA');
}

export function digestDateLabel(date: string) {
  const timestamp = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(timestamp)) return date;
  if (date === localDateKey()) return '今天';
  return new Intl.DateTimeFormat('zh-CN', {
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(timestamp);
}

export function itemTime(timestamp: number) {
  const date = new Date(timestamp);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat('zh-CN', {
    ...(includeYear ? { year: 'numeric' } : {}),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function itemDateTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

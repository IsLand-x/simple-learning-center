export function markdownNoteTitle(content: string, fallback = '未命名笔记') {
  const heading = content.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);

  const firstLine = content
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-+*>]|\d+\.)\s*/, '').replace(/[*_`~#[\]]/g, '').trim())
    .find(Boolean);
  return (firstLine || fallback).slice(0, 120);
}

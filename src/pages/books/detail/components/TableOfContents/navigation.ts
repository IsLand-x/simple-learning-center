import type { TocItem } from '../../../../../../contracts/books';

function normalizeHref(href?: string) {
  if (!href) return undefined;
  try {
    return decodeURI(href).replace(/^\.\//, '').replace(/^\//, '');
  } catch {
    return href.replace(/^\.\//, '').replace(/^\//, '');
  }
}

export function hrefsMatch(left?: string, right?: string) {
  const normalizedLeft = normalizeHref(left);
  const normalizedRight = normalizeHref(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`/${normalizedRight}`) ||
    normalizedRight.endsWith(`/${normalizedLeft}`)
  );
}

export function findActiveItem(items: TocItem[], activeHref?: string): TocItem | undefined {
  for (const item of items) {
    if (hrefsMatch(item.href, activeHref)) return item;
    const child = item.subitems && findActiveItem(item.subitems, activeHref);
    if (child) return child;
  }
  return undefined;
}

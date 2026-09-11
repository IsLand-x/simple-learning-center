import type { TocItem } from '../../../types';

export function flattenToc(items: TocItem[]): TocItem[] {
  return items.flatMap((item) => [item, ...flattenToc(item.subitems ?? [])]);
}

export function findChapterLabel(items: TocItem[], href?: string) {
  if (!href) return undefined;
  const normalize = (value: string) => {
    try {
      return decodeURI(value).replace(/^\.\//, '').replace(/^\//, '');
    } catch {
      return value.replace(/^\.\//, '').replace(/^\//, '');
    }
  };
  const matches = (left: string, right: string) => {
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    return (
      normalizedLeft === normalizedRight ||
      normalizedLeft.endsWith(`/${normalizedRight}`) ||
      normalizedRight.endsWith(`/${normalizedLeft}`)
    );
  };
  const flattened = flattenToc(items);
  const exact = flattened.find((item) => matches(item.href, href));
  if (exact) return exact.label;
  const hrefWithoutFragment = href.split('#')[0];
  return flattened.find((item) => matches(item.href.split('#')[0], hrefWithoutFragment))?.label;
}

export function isReaderKeyboardEditingTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element &&
    typeof element.closest === 'function' &&
    element.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="slider"]',
    ),
  );
}

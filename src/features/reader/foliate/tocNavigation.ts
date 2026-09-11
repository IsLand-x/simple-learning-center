import type {
  FoliateNavigationTarget,
  FoliateTocItem,
  View as FoliateView,
} from 'foliate-js/view.js';
import { getFoliateContents } from '../../../lib/foliateReader';
import { FOLIATE_NAVIGATION_RETRY_MS } from './constants';

export function flattenFoliateToc(items: FoliateTocItem[]): FoliateTocItem[] {
  return items.flatMap((item) => [item, ...flattenFoliateToc(item.subitems ?? [])]);
}

function normalizeReaderHref(href: string) {
  try {
    return decodeURI(href).replace(/^\.\//, '').replace(/^\//, '');
  } catch {
    return href.replace(/^\.\//, '').replace(/^\//, '');
  }
}

function hrefsMatch(left: string, right: string) {
  const normalizedLeft = normalizeReaderHref(left);
  const normalizedRight = normalizeReaderHref(right);
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`/${normalizedRight}`) ||
    normalizedRight.endsWith(`/${normalizedLeft}`)
  );
}

function normalizeTocLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function canNavigateTo(view: FoliateView, target: string | number | undefined) {
  if (target === undefined || target === '') return false;
  const resolved = view.resolveNavigation(target);
  return Boolean(
    resolved &&
    Number.isInteger(resolved.index) &&
    resolved.index >= 0 &&
    resolved.index < view.book.sections.length,
  );
}

export function resolveFoliateTarget(view: FoliateView, target: string, label?: string) {
  if (canNavigateTo(view, target)) return target;
  const flattenedToc = flattenFoliateToc(view.book.toc ?? []);
  const tocTarget =
    flattenedToc.find((item) => hrefsMatch(item.href, target))?.href ??
    (label
      ? flattenedToc.find((item) => normalizeTocLabel(item.label) === normalizeTocLabel(label))
          ?.href
      : undefined);
  if (tocTarget && canNavigateTo(view, tocTarget)) return tocTarget;
  return undefined;
}

async function getFoliateAnchorPosition(
  view: FoliateView,
  resolved: FoliateNavigationTarget,
): Promise<'before' | 'visible' | 'after' | 'unknown'> {
  if (typeof resolved.anchor !== 'function') return 'unknown';
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  const content = getFoliateContents(view).find((item) => item.index === resolved.index);
  if (!content) return 'unknown';
  const anchor = resolved.anchor(content.doc);
  if (!anchor || typeof anchor === 'number' || typeof anchor.getBoundingClientRect !== 'function')
    return 'unknown';
  const targetRect = anchor.getBoundingClientRect();
  const frameRect = content.doc.defaultView?.frameElement?.getBoundingClientRect();
  if (!frameRect) return 'unknown';
  const readerRect = view.getBoundingClientRect();
  const left = frameRect.left + targetRect.left;
  const right = frameRect.left + targetRect.right;
  const top = frameRect.top + targetRect.top;
  const bottom = frameRect.top + targetRect.bottom;
  if (right <= readerRect.left + 1 || bottom <= readerRect.top + 1) {
    return 'before';
  }
  if (left >= readerRect.right - 1 || top >= readerRect.bottom - 1) return 'after';
  return 'visible';
}

export async function ensureFoliateAnchorIsVisible(
  view: FoliateView,
  resolved: FoliateNavigationTarget,
) {
  const position = await getFoliateAnchorPosition(view, resolved);
  if (position === 'before') await view.prev();
  else if (position === 'after') await view.next();
  return position;
}

export async function navigateToFoliateTarget(view: FoliateView, target: string) {
  let resolved = await view.goTo(target);
  if (!resolved) return false;
  const firstPosition = await getFoliateAnchorPosition(view, resolved);
  if (firstPosition === 'before' || firstPosition === 'after') {
    await new Promise<void>((resolve) => window.setTimeout(resolve, FOLIATE_NAVIGATION_RETRY_MS));
    resolved = (await view.goTo(target)) ?? resolved;
  }
  await ensureFoliateAnchorIsVisible(view, resolved);
  return true;
}

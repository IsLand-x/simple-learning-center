import { Overlayer } from 'foliate-js/overlayer.js';
import type { View as FoliateView } from 'foliate-js/view.js';
import type { MindMapSource } from '../../../../../../../contracts/reading';
import { findQuoteRange } from '../../../../../../util/reading/textAnchors';
import { getFoliateContents } from './readerAdapter';
import { navigateToFoliateTarget } from './tocNavigation';

const hints = new WeakMap<FoliateView, () => void>();

export function clearMindMapSourceHint(view: FoliateView) {
  hints.get(view)?.();
  hints.delete(view);
}

export async function locateMindMapSource(view: FoliateView, source: MindMapSource) {
  if (!source.cfi) throw new Error('该出处缺少定位信息，请重新生成导图');
  const target = view.resolveNavigation(source.cfi);
  if (!target || typeof target.anchor !== 'function')
    throw new Error('原文位置已失效，请重新生成导图');
  const section = view.book.sections[target.index];
  if (!section?.createDocument) throw new Error('无法读取出处所在章节');
  const document = await section.createDocument();
  const anchor = target.anchor(document);
  if (!anchor || typeof anchor === 'number' || !('startContainer' in anchor))
    throw new Error('无法解析原文位置');
  const range = findQuoteRange(document, source.quote, anchor as Range);
  if (!range) throw new Error('未能在原文位置核验这段引用，请重新生成导图');
  const cfi = view.getCFI(target.index, range);
  if (!(await navigateToFoliateTarget(view, cfi))) throw new Error('无法跳转到原文位置');
  const content = getFoliateContents(view).find((item) => item.index === target.index);
  const resolved = view.resolveNavigation(cfi);
  const liveRange =
    content && typeof resolved?.anchor === 'function' ? resolved.anchor(content.doc) : undefined;
  if (
    !content?.overlayer ||
    !liveRange ||
    typeof liveRange === 'number' ||
    !('startContainer' in liveRange)
  )
    return;
  const key = 'mindmap-source-hint';
  const color = content.doc.defaultView
    ?.getComputedStyle(content.doc.documentElement)
    .getPropertyValue('--reader-highlight-color')
    .trim();
  if (!color) return;
  const overlayer = content.overlayer;
  overlayer.add(key, liveRange as Range, Overlayer.highlight, { color });
  const timer = window.setTimeout(() => clearMindMapSourceHint(view), 2400);
  hints.set(view, () => {
    window.clearTimeout(timer);
    overlayer.remove(key);
  });
}

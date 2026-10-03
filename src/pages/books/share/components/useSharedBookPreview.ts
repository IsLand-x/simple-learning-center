import { READER_DENSITY_PRESETS } from '../../../../util/reading/readerThemes';
import { useEffect, useRef, useState } from 'react';
import type { FoliateRelocateDetail, FoliateTocItem, View } from 'foliate-js/view.js';
import { bookSharesApi } from '../../../../api/book-shares';
import {
  createFoliateView,
  prepareFoliateBookForBrowser,
} from '../../../../util/reading/foliateBrowser';

function flattenToc(items: FoliateTocItem[], depth = 0): Array<{ href: string; label: string }> {
  return items.flatMap((item) => [
    { href: item.href, label: `${'　'.repeat(depth)}${item.label}` },
    ...flattenToc(item.subitems ?? [], depth + 1),
  ]);
}

export function useSharedBookPreview(token: string) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const queueRef = useRef(Promise.resolve());
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [chapter, setChapter] = useState('');
  const [toc, setToc] = useState<Array<{ href: string; label: string }>>([]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const view = createFoliateView();
    viewRef.current = view;
    view.style.cssText = 'display:block;width:100%;height:100%;';
    hostRef.current?.replaceChildren(view);
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest('input,textarea,select,[contenteditable]'))
        return;
      const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
        ? 'next'
        : ['ArrowLeft', 'ArrowUp'].includes(event.key)
          ? 'prev'
          : null;
      if (!direction) return;
      event.preventDefault();
      queueRef.current = queueRef.current
        .then(async () => {
          if (!disposed) await view[direction]();
        })
        .catch(() => {
          if (!disposed) setError('翻页失败，请重试');
        });
    };
    const documentCleanups: Array<() => void> = [];
    view.addEventListener('load', (event) => {
      const { doc } = (event as CustomEvent<{ doc: Document }>).detail;
      doc.addEventListener('keydown', keydown);
      documentCleanups.push(() => doc.removeEventListener('keydown', keydown));
    });
    view.addEventListener('relocate', (event) => {
      const location = (event as CustomEvent<FoliateRelocateDetail>).detail;
      if (!disposed) setChapter(location.tocItem?.label ?? '');
    });
    window.addEventListener('keydown', keydown);
    void (async () => {
      try {
        const data = await bookSharesApi.loadEpub(token, controller.signal);
        if (disposed) return;
        await view.open(new File([data], 'shared-book.epub', { type: 'application/epub+zip' }));
        if (disposed) {
          view.close();
          return;
        }
        prepareFoliateBookForBrowser(view, true);
        view.renderer.setAttribute('flow', 'paginated');
        view.renderer.setAttribute('max-column-count', '1');
        view.renderer.setAttribute('max-inline-size', '880px');
        view.renderer.setAttribute('gap', '7%');
        view.renderer.setAttribute('margin', '16px');
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
          view.renderer.setAttribute('animated', '');
        const colors = getComputedStyle(document.body);
        const density = READER_DENSITY_PRESETS.find((item) => item.id === 'balanced')!;
        view.renderer.setStyles?.(
          `html,body { color:${colors.getPropertyValue('--semi-color-text-0')}; background:${colors.getPropertyValue('--semi-color-bg-0')}; overscroll-behavior:contain; touch-action:pan-y; } body { font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif; font-size:18px; line-height:${density.lineHeight}; padding-inline:${density.pagePadding}; } p { margin-block-end:${density.paragraphSpacing}em; } img,svg { max-width:100%; }`,
        );
        await view.init({ showTextStart: true });
        if (disposed) return;
        setToc(flattenToc(view.book.toc ?? []));
        setStatus('ready');
      } catch (failure) {
        if (!disposed) {
          setError(failure instanceof Error ? failure.message : '书籍加载失败');
          setStatus('error');
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      window.removeEventListener('keydown', keydown);
      documentCleanups.forEach((cleanup) => cleanup());
      view.close();
      view.remove();
      viewRef.current = null;
    };
  }, [token]);

  const navigate = (target: 'next' | 'prev' | { href: string }) => {
    queueRef.current = queueRef.current
      .then(async () => {
        const view = viewRef.current;
        if (!view) return;
        if (typeof target === 'string') await view[target]();
        else await view.goTo(target.href);
      })
      .catch(() => setError('跳转失败，请重试'));
  };
  return { hostRef, status, error, chapter, toc, navigate };
}

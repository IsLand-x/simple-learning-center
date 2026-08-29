import { IconComment } from '@douyinfe/semi-icons';
import { Empty, Spin, Typography } from '@douyinfe/semi-ui';
import {
  DecorationStyleType,
  EpubNavigator,
  EpubPreferences,
  FrameManager,
  type Decoration,
  type DecorationObserver,
} from '@readium/navigator';
import {
  Loader,
  ModuleLibrary,
  type BasicTextSelection,
  type FrameClickEvent,
} from '@readium/navigator-html-injectables';
import {
  HttpFetcher,
  Link,
  Locator,
  LocatorLocations,
  LocatorText,
  Manifest,
  Publication,
  type Links,
} from '@readium/shared';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { ensureReaderFontStylesheet, READER_FONT_STACKS } from '../lib/readerFonts';
import { isReaderCenterTap } from '../lib/readerGestures';
import { getReaderTextureStyle, resolveReaderStyle } from '../lib/readerThemes';
import type { HighlightItem, ReaderPreferences } from '../types';
import type { ReaderSurfaceHandle, ReaderSurfaceProps } from './ReaderSurface';

const { Text } = Typography;
const HIGHLIGHT_GROUP = 'learning-center-highlights';
const LOCATOR_PREFIX = 'readium:';
const READIUM_FRAME_LOAD_PATCH = Symbol.for('learning-center.readium-frame-load');
const READIUM_SELECTION_GESTURE_PATCH = Symbol.for('learning-center.readium-selection-gesture');

type ReadiumFrame = NonNullable<EpubNavigator['_cframes'][number]>;

interface ReadiumColumnSnapperState {
  wnd?: Window;
  touchState?: number;
  startingX?: number;
  endingX?: number;
  overscroll?: number;
  alreadyScrollLeft?: number;
}

interface ReadiumColumnSnapperPrototype {
  [READIUM_SELECTION_GESTURE_PATCH]?: boolean;
  onTouchStart: (event: TouchEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
}

function hasNativeSelection(snapper: ReadiumColumnSnapperState) {
  const selection = snapper.wnd?.getSelection();
  return Boolean(selection?.rangeCount && !selection.isCollapsed && selection.toString());
}

function releaseSelectionGesture(snapper: ReadiumColumnSnapperState) {
  const scrollingElement = snapper.wnd?.document.scrollingElement as HTMLElement | null;
  if (scrollingElement) {
    scrollingElement.style.removeProperty('transform');
    if (snapper.alreadyScrollLeft !== undefined) scrollingElement.scrollLeft = snapper.alreadyScrollLeft;
  }
  snapper.touchState = 0;
  snapper.startingX = undefined;
  snapper.endingX = undefined;
  snapper.overscroll = 0;
}

function installReadiumSelectionGestureCompatibility() {
  const Snapper = ModuleLibrary.get('column_snapper') as unknown as {
    prototype?: ReadiumColumnSnapperPrototype;
  } | undefined;
  const prototype = Snapper?.prototype;
  if (!prototype || prototype[READIUM_SELECTION_GESTURE_PATCH]) return;
  prototype[READIUM_SELECTION_GESTURE_PATCH] = true;
  const originalStart = prototype.onTouchStart;
  const originalMove = prototype.onTouchMove;
  const originalEnd = prototype.onTouchEnd;
  prototype.onTouchStart = function selectionAwareTouchStart(event) {
    const state = this as unknown as ReadiumColumnSnapperState;
    if (hasNativeSelection(state)) return releaseSelectionGesture(state);
    return originalStart.call(this, event);
  };
  prototype.onTouchMove = function selectionAwareTouchMove(event) {
    const state = this as unknown as ReadiumColumnSnapperState;
    // A long press creates the native selection after touchstart. Once it exists,
    // pagination must not clear it or interpret movement of either handle as a swipe.
    if (hasNativeSelection(state)) return releaseSelectionGesture(state);
    return originalMove.call(this, event);
  };
  prototype.onTouchEnd = function selectionAwareTouchEnd(event) {
    const state = this as unknown as ReadiumColumnSnapperState;
    if (hasNativeSelection(state)) return releaseSelectionGesture(state);
    return originalEnd.call(this, event);
  };
}

function installReadiumFrameLoadCompatibility() {
  const prototype = FrameManager.prototype as FrameManager & {
    [READIUM_FRAME_LOAD_PATCH]?: boolean;
  };
  if (prototype[READIUM_FRAME_LOAD_PATCH]) return;
  prototype[READIUM_FRAME_LOAD_PATCH] = true;
  const originalLoad = prototype.load;
  prototype.load = function compatibleFrameLoad(modules: Parameters<FrameManager['load']>[0]) {
    const state = this as unknown as {
      loader?: Loader;
      currModules: Parameters<FrameManager['load']>[0];
      comms?: { halt: () => void };
    };
    if (state.loader) return originalLoad.call(this, modules);
    const frame = this.iframe;
    return new Promise<Window>((resolve, reject) => {
      frame.onload = () => {
        const wnd = frame.contentWindow;
        if (!wnd) {
          reject(new Error('Readium iframe 加载失败'));
          return;
        }
        state.loader = new Loader(wnd as ConstructorParameters<typeof Loader>[0], modules);
        state.currModules = modules;
        resolve(wnd);
      };
      frame.onerror = () => reject(new Error('Readium iframe 加载失败'));
      // Chromium does not reliably dispatch `load` when a sandboxed blank iframe is
      // navigated to a blob URL. Loading the already-sanitized Readium document
      // through srcdoc preserves the same sandbox/CSP boundary and completes.
      void fetch(this.source)
        .then((response) => {
          if (!response.ok) throw new Error('Readium 章节加载失败');
          return response.text();
        })
        .then((source) => { frame.srcdoc = source; })
        .catch(reject);
    });
  };
}

installReadiumFrameLoadCompatibility();
installReadiumSelectionGestureCompatibility();

function serializeLocator(locator: Locator) {
  return `${LOCATOR_PREFIX}${JSON.stringify(locator.serialize())}`;
}

function deserializeLocator(value?: string) {
  if (!value?.startsWith(LOCATOR_PREFIX)) return undefined;
  try {
    return Locator.deserialize(JSON.parse(value.slice(LOCATOR_PREFIX.length)));
  } catch {
    return undefined;
  }
}

function normalizedHref(value: string) {
  try {
    return decodeURI(value).replace(/^\.\//, '').replace(/^\//, '').split('#', 1)[0];
  } catch {
    return value.replace(/^\.\//, '').replace(/^\//, '').split('#', 1)[0];
  }
}

function hrefMatches(left: string, right: string) {
  const normalizedLeft = normalizedHref(left);
  const normalizedRight = normalizedHref(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(`/${normalizedRight}`)
    || normalizedRight.endsWith(`/${normalizedLeft}`);
}

function flattenLinks(links?: Links): Link[] {
  if (!links) return [];
  return links.items.flatMap((link) => [link, ...flattenLinks(link.children)]);
}

function findNavigationLink(publication: Publication, target: string, label?: string) {
  const links = [
    ...flattenLinks(publication.toc),
    ...publication.readingOrder.items,
  ];
  return links.find((link) => hrefMatches(link.href, target))
    ?? (label ? links.find((link) => link.title?.trim() === label.trim()) : undefined);
}

function locatorForLink(publication: Publication, link: Link) {
  return publication.manifest.locatorFromLink(link)
    ?? new Locator({ href: link.href, type: link.type ?? 'application/xhtml+xml', title: link.title });
}

function findFrame(navigator: EpubNavigator, source?: string) {
  const frames = navigator._cframes.filter(Boolean) as ReadiumFrame[];
  if (!source) return frames.find((frame) => {
    const selection = frame.iframe.contentWindow?.getSelection();
    return Boolean(selection && selection.rangeCount && !selection.isCollapsed);
  }) ?? frames[0];
  return frames.find((frame) => {
    if (frame.source === source) return true;
    try {
      return frame.iframe.contentWindow?.location.href === source;
    } catch {
      return false;
    }
  }) ?? frames[0];
}

function viewportRect(frame: ReadiumFrame | undefined, rect: { x: number; y: number; width: number; height: number }) {
  const frameRect = frame?.iframe.getBoundingClientRect();
  return {
    left: (frameRect?.left ?? 0) + rect.x,
    top: (frameRect?.top ?? 0) + rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function selectionLocator(navigator: EpubNavigator, selection: BasicTextSelection) {
  const base = selection.locator;
  if (!base) return undefined;
  const frame = findFrame(navigator, selection.targetFrameSrc);
  const wnd = frame?.iframe.contentWindow;
  const documentSelection = wnd?.getSelection();
  if (!wnd || !documentSelection?.rangeCount || documentSelection.isCollapsed) return base;
  const range = documentSelection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as Element
    : range.commonAncestorContainer.parentElement;
  if (!commonAncestor) return base;
  const generator = (wnd as Window & {
    _readium_cssSelectorGenerator?: { getCssSelector: (element: Element) => string };
  })._readium_cssSelectorGenerator;
  const cssSelector = generator?.getCssSelector(commonAncestor);
  let before: string | undefined;
  let after: string | undefined;
  try {
    const beforeRange = wnd.document.createRange();
    beforeRange.selectNodeContents(commonAncestor);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    before = beforeRange.toString().slice(-48) || undefined;
    const afterRange = wnd.document.createRange();
    afterRange.selectNodeContents(commonAncestor);
    afterRange.setStart(range.endContainer, range.endOffset);
    after = afterRange.toString().slice(0, 48) || undefined;
  } catch {
    // The quote alone remains a valid fallback locator.
  }
  return new Locator({
    href: base.href,
    type: base.type,
    title: base.title,
    locations: new LocatorLocations({
      ...base.locations,
      otherLocations: cssSelector ? new Map([['cssSelector', cssSelector]]) : undefined,
    }),
    text: new LocatorText({ before, highlight: selection.text, after }),
  });
}

function readerPreferences(preferences: ReaderPreferences, compactLayout: boolean) {
  const style = resolveReaderStyle(preferences);
  return new EpubPreferences({
    backgroundColor: style.paperColor,
    columnCount: 1,
    fontFamily: READER_FONT_STACKS[style.fontFamily],
    fontSize: style.fontSize / 18,
    lineHeight: style.density.lineHeight,
    linkColor: style.accentColor,
    pageGutter: compactLayout ? 14 : 28,
    paragraphSpacing: style.density.paragraphSpacing,
    scroll: false,
    selectionBackgroundColor: style.highlightColor,
    textColor: style.textColor,
    visitedColor: style.accentColor,
  });
}

function createPositions(publication: Publication) {
  const count = publication.readingOrder.items.length;
  return publication.readingOrder.items.map((link, index) => new Locator({
    href: link.href,
    type: link.type ?? 'application/xhtml+xml',
    title: link.title,
    locations: new LocatorLocations({
      position: index + 1,
      progression: 0,
      totalProgression: count <= 1 ? 0 : index / count,
    }),
  }));
}

function initialLocator(publication: Publication, positions: Locator[], book: ReaderSurfaceProps['book']) {
  const stored = deserializeLocator(book.currentLocator);
  if (stored && publication.readingOrder.findWithHref(stored.href)) return stored;
  const chapterTarget = book.toc.find((item) => item.label.trim() === book.currentChapter.trim());
  if (chapterTarget) {
    const link = findNavigationLink(publication, chapterTarget.href, chapterTarget.label);
    if (link) {
      const readingOrderIndex = publication.readingOrder.findIndexWithHref(link.href);
      if (readingOrderIndex >= 0) return positions[readingOrderIndex];
    }
  }
  return positions[0];
}

function progressForLocator(publication: Publication, locator: Locator) {
  const index = publication.readingOrder.findIndexWithHref(locator.href);
  if (index < 0) return undefined;
  const progression = locator.locations.progression ?? 0;
  return ((index + progression) / Math.max(1, publication.readingOrder.items.length)) * 100;
}

function decorationForHighlight(highlight: HighlightItem, tint: string): Decoration | undefined {
  const locator = deserializeLocator(highlight.locator);
  if (!locator) return undefined;
  return {
    id: highlight.id,
    locator,
    style: {
      type: DecorationStyleType.Highlight,
      tint,
      expand: 2,
    },
    extras: { comment: Boolean(highlight.comment || highlight.kind === 'comment') },
  };
}

interface ReadiumEpubReaderProps extends ReaderSurfaceProps {
  controllerRef: Ref<ReaderSurfaceHandle>;
}

export function ReadiumEpubReader({
  book,
  compactLayout,
  preferences,
  highlights,
  onLocationChange,
  onSelection,
  onHighlightClick,
  onContentInteraction,
  onCenterTap,
  controllerRef,
}: ReadiumEpubReaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const navigatorRef = useRef<EpubNavigator | null>(null);
  const publicationRef = useRef<Publication | null>(null);
  const navigationQueueRef = useRef(Promise.resolve());
  const preferencesRef = useRef(preferences);
  const compactLayoutRef = useRef(compactLayout);
  const highlightsRef = useRef(highlights);
  const callbacksRef = useRef({ onLocationChange, onSelection, onHighlightClick, onContentInteraction, onCenterTap });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('请返回书架后重新导入这个 EPUB');

  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { compactLayoutRef.current = compactLayout; }, [compactLayout]);
  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);
  useEffect(() => {
    callbacksRef.current = { onLocationChange, onSelection, onHighlightClick, onContentInteraction, onCenterTap };
  }, [onCenterTap, onContentInteraction, onHighlightClick, onLocationChange, onSelection]);

  const enqueueNavigation = useCallback((operation: (navigator: EpubNavigator) => Promise<void> | void) => {
    const queuedNavigator = navigatorRef.current;
    if (!queuedNavigator) return;
    const queued = navigationQueueRef.current.catch(() => undefined).then(async () => {
      if (navigatorRef.current === queuedNavigator) await operation(queuedNavigator);
    });
    navigationQueueRef.current = queued.catch(() => undefined);
  }, []);

  const turnPage = useCallback((direction: 'next' | 'prev') => {
    callbacksRef.current.onSelection(null);
    enqueueNavigation((navigator) => new Promise<void>((resolve) => {
      const completed = () => resolve();
      if (direction === 'next') navigator.goForward(true, completed);
      else navigator.goBackward(true, completed);
    }));
  }, [enqueueNavigation]);

  useImperativeHandle(controllerRef, () => ({
    next: () => turnPage('next'),
    prev: () => turnPage('prev'),
    display: (target, label) => {
      enqueueNavigation((navigator) => new Promise<void>((resolve) => {
        const publication = publicationRef.current;
        if (!publication) return resolve();
        const locator = deserializeLocator(target);
        if (locator) {
          navigator.go(locator, true, () => resolve());
          return;
        }
        const link = findNavigationLink(publication, target, label);
        if (!link) return resolve();
        navigator.go(locatorForLink(publication, link), true, () => resolve());
      }));
    },
    clearSelection: () => {
      navigatorRef.current?._cframes.filter(Boolean).forEach((frame) => {
        frame?.iframe.contentWindow?.getSelection()?.removeAllRanges();
      });
      callbacksRef.current.onSelection(null);
    },
    getCurrentText: () => navigatorRef.current?._cframes
      .filter(Boolean)
      .map((frame) => frame?.iframe.contentDocument?.body?.innerText.trim() ?? '')
      .filter(Boolean)
      .join('\n\n') ?? '',
  }), [enqueueNavigation, turnPage]);

  useEffect(() => {
    let disposed = false;
    let ownedNavigator: EpubNavigator | null = null;
    const setup = async () => {
      setStatus('loading');
      const manifestUrl = `/api/readium/books/${encodeURIComponent(book.id)}/manifest.json`;
      const response = await fetch(manifestUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(response.status === 404 ? 'EPUB 文件不存在' : 'EPUB Publication 加载失败');
      const manifest = Manifest.deserialize(await response.json());
      if (!manifest) throw new Error('EPUB Publication 格式不正确');
      manifest.setSelfLink(new URL(manifestUrl, window.location.href).href);
      const publication = new Publication({
        manifest,
        fetcher: new HttpFetcher(window.fetch.bind(window), manifest.baseURL),
      });
      const positions = createPositions(publication);
      if (!positions.length) throw new Error('EPUB 中没有可渲染的正文');
      const host = hostRef.current;
      if (!host || disposed) return;

      const navigator = new EpubNavigator(
        host,
        publication,
        {
          frameLoaded: (wnd) => {
            const font = resolveReaderStyle(preferencesRef.current).fontFamily;
            void ensureReaderFontStylesheet(wnd.document, font).then(() => wnd.document.fonts?.ready);
          },
          positionChanged: (locator) => {
            callbacksRef.current.onLocationChange({
              href: locator.href,
              locator: serializeLocator(locator),
              progress: progressForLocator(publication, locator),
            });
            if (!disposed) setStatus('ready');
          },
          timelineItemChanged: () => undefined,
          tap: (event) => {
            callbacksRef.current.onContentInteraction();
            if (!compactLayoutRef.current || event.interactiveElement) return false;
            const ratio = window.devicePixelRatio || 1;
            const frame = findFrame(navigator, event.targetFrameSrc);
            const width = frame?.iframe.contentWindow?.innerWidth ?? host.clientWidth;
            const height = frame?.iframe.contentWindow?.innerHeight ?? host.clientHeight;
            if (!isReaderCenterTap({ x: event.x / ratio, y: event.y / ratio, width, height })) return false;
            callbacksRef.current.onCenterTap();
            return true;
          },
          click: (event) => {
            callbacksRef.current.onContentInteraction();
            if (event.interactiveElement || !compactLayoutRef.current) return false;
            if (!compactCenterClick(event, navigator, host)) return false;
            callbacksRef.current.onCenterTap();
            return true;
          },
          zoom: () => undefined,
          miscPointer: () => undefined,
          scroll: () => undefined,
          customEvent: () => undefined,
          handleLocator: (locator) => {
            if (/^https?:\/\//i.test(locator.href)) {
              window.open(locator.href, '_blank', 'noopener,noreferrer');
              return true;
            }
            return false;
          },
          textSelected: (selection) => {
            const locator = selectionLocator(navigator, selection);
            if (!locator) return;
            const serialized = serializeLocator(locator);
            callbacksRef.current.onSelection({
              text: selection.text,
              cfi: serialized,
              locator: serialized,
              rect: viewportRect(findFrame(navigator, selection.targetFrameSrc), selection),
            });
          },
          contentProtection: () => undefined,
          contextMenu: () => undefined,
          peripheral: () => undefined,
        },
        positions,
        initialLocator(publication, positions, book),
        {
          preferences: readerPreferences(preferencesRef.current, compactLayoutRef.current),
          defaults: {},
        },
      );
      ownedNavigator = navigator;
      navigatorRef.current = navigator;
      publicationRef.current = publication;
      host.replaceChildren();
      await navigator.load();
      if (disposed || navigatorRef.current !== navigator) return;

      const observer: DecorationObserver = {
        onDecorationActivated: ({ decoration, rect }) => {
          const frame = findFrame(navigator);
          const ratio = window.devicePixelRatio || 1;
          callbacksRef.current.onHighlightClick({
            highlightId: decoration.id,
            rect: viewportRect(frame, {
              x: rect.left / ratio,
              y: rect.top / ratio,
              width: rect.width / ratio,
              height: rect.height / ratio,
            }),
          });
          return true;
        },
      };
      navigator.registerDecorationObserver(HIGHLIGHT_GROUP, observer);
      const tint = resolveReaderStyle(preferencesRef.current).highlightColor;
      navigator.applyDecorations(
        highlightsRef.current.map((highlight) => decorationForHighlight(highlight, tint)).filter(Boolean) as Decoration[],
        HIGHLIGHT_GROUP,
      );
      if (!disposed) setStatus('ready');
    };

    void setup().catch((error: unknown) => {
      if (disposed) return;
      setErrorMessage(error instanceof Error ? error.message : 'EPUB Publication 加载失败');
      setStatus('error');
    });

    return () => {
      disposed = true;
      const navigator = ownedNavigator;
      if (navigatorRef.current === navigator) navigatorRef.current = null;
      publicationRef.current = null;
      navigationQueueRef.current = Promise.resolve();
      if (navigator) void navigator.destroy();
      hostRef.current?.replaceChildren();
    };
  }, [book.id]);

  useEffect(() => {
    const navigator = navigatorRef.current;
    if (!navigator || status !== 'ready') return;
    void navigator.submitPreferences(readerPreferences(preferences, compactLayout));
    navigator._cframes.filter(Boolean).forEach((frame) => {
      if (!frame?.iframe.contentDocument) return;
      void ensureReaderFontStylesheet(frame.iframe.contentDocument, resolveReaderStyle(preferences).fontFamily);
    });
  }, [compactLayout, preferences, status]);

  useEffect(() => {
    const navigator = navigatorRef.current;
    if (!navigator || status !== 'ready') return;
    const tint = resolveReaderStyle(preferences).highlightColor;
    navigator.applyDecorations(
      highlights.map((highlight) => decorationForHighlight(highlight, tint)).filter(Boolean) as Decoration[],
      HIGHLIGHT_GROUP,
    );
  }, [highlights, preferences, status]);

  const readerStyle = resolveReaderStyle(preferences);
  const texture = getReaderTextureStyle(readerStyle.texture, readerStyle.isDark);
  const surfaceStyle = {
    '--reader-paper-color': readerStyle.paperColor,
    '--reader-color-scheme': readerStyle.isDark ? 'dark' : 'light',
    '--reader-texture-image': texture.backgroundImage,
    '--reader-texture-size': texture.backgroundSize,
    '--reader-texture-position': texture.backgroundPosition,
    '--reader-texture-blend-mode': texture.backgroundBlendMode,
  } as CSSProperties;

  return (
    <div className="readium-reader-wrap" style={surfaceStyle} onPointerDown={onContentInteraction}>
      <span className="reader-comment-icon-template" aria-hidden="true"><IconComment size="large" /></span>
      {status === 'loading' && (
        <div className="reader-status"><Spin size="large" /><Text type="tertiary">正在打开 Readium EPUB…</Text></div>
      )}
      {status === 'error' && (
        <div className="reader-status"><Empty title="Readium 无法打开这本书" description={errorMessage} /></div>
      )}
      <div ref={hostRef} className="readium-reader-host" aria-label={`《${book.title}》Readium 阅读区`} />
    </div>
  );
}

function compactCenterClick(
  event: FrameClickEvent,
  navigator: EpubNavigator,
  host: HTMLElement,
) {
  if (!event.targetFrameSrc) return false;
  const frame = findFrame(navigator, event.targetFrameSrc);
  const ratio = window.devicePixelRatio || 1;
  const width = frame?.iframe.contentWindow?.innerWidth ?? host.clientWidth;
  const height = frame?.iframe.contentWindow?.innerHeight ?? host.clientHeight;
  return isReaderCenterTap({ x: event.x / ratio, y: event.y / ratio, width, height });
}

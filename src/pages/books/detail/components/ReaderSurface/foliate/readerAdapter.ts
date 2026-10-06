import { Overlayer, type FoliateOverlayRect } from 'foliate-js/overlayer.js';
import type {
  FoliateAnnotation,
  FoliateRendererContent,
  View as FoliateView,
} from 'foliate-js/view.js';
import type { HighlightItem, ReaderPreferences } from '../../../../../../../contracts/reading';
import readerProseStyles from '../../../../../../styles/reader-prose.css?inline';
import {
  getReaderFontStylesheet,
  READER_FONT_STACKS,
} from '../../../../../../util/reading/readerFonts';
import {
  getReaderTextureStyle,
  READER_PAGE_MAX_INLINE_SIZE,
  resolveReaderStyle,
} from '../../../../../../util/reading/readerThemes';
import { createReaderTextSelectionCursor } from '../textCursor';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const COMMENT_BADGE_SIZE = 20;
export interface ReaderFoliateAnnotation extends FoliateAnnotation {
  highlightId: string;
  kind?: HighlightItem['kind'];
  comment?: string;
}

export function applyFoliateReaderLayout(view: FoliateView, compactLayout: boolean) {
  const renderer = view.renderer;
  renderer.setAttribute('gap', compactLayout ? '3%' : '7%');
  renderer.setAttribute('margin', compactLayout ? '14px' : '28px');
}

export function configureFoliateReader(
  view: FoliateView,
  preferences: ReaderPreferences,
  compactLayout: boolean,
) {
  const renderer = view.renderer;
  renderer.setAttribute('flow', 'paginated');
  applyFoliateReaderLayout(view, compactLayout);
  renderer.setAttribute('max-inline-size', READER_PAGE_MAX_INLINE_SIZE);
  renderer.setAttribute('max-block-size', '1440px');
  renderer.setAttribute('max-column-count', '1');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderer.removeAttribute('animated');
  } else {
    renderer.setAttribute('animated', '');
  }
  applyFoliateReaderStyle(view, preferences, compactLayout);
}

export function applyFoliateReaderStyle(
  view: FoliateView,
  preferences: ReaderPreferences,
  compactLayout: boolean,
) {
  view.renderer.setStyles?.(createFoliateReaderStyles(preferences, compactLayout));
}

function createFoliateReaderStyles(preferences: ReaderPreferences, compactLayout: boolean) {
  const style = resolveReaderStyle(preferences);
  const texture = getReaderTextureStyle(style.texture, style.isDark);
  const fontFamily = READER_FONT_STACKS[style.fontFamily];
  const fontStylesheet = getReaderFontStylesheet(style.fontFamily);
  const pagePadding = compactLayout ? 'clamp(12px, 4vw, 18px)' : style.density.pagePadding;
  const textSelectionCursor = createReaderTextSelectionCursor(style);
  const mobileSelectionStyles = compactLayout
    ? `html, body, body * { -webkit-touch-callout: none !important; }`
    : '';
  const desktopTextCursorStyles = compactLayout
    ? ''
    : `
      @media (hover: hover) and (pointer: fine) {
        html, body {
          cursor: ${textSelectionCursor};
        }
        body :where(a, button, input, textarea, select, option, label, summary, img, svg, video, [role="button"], [contenteditable="true"]) {
          cursor: auto;
        }
      }
      @media (forced-colors: active) {
        html, body {
          cursor: text !important;
        }
      }
    `;
  return `
    ${fontStylesheet ? `@import url("${fontStylesheet}");` : ''}
    @namespace epub "http://www.idpf.org/2007/ops";
    :root {
      color-scheme: ${style.isDark ? 'dark' : 'light'};
      --theme-bg-color: ${style.paperColor};
      --reader-line-height: ${style.density.lineHeight};
      --reader-letter-spacing: ${style.density.letterSpacing};
      --reader-paragraph-spacing: ${style.density.paragraphSpacing}em;
      --reader-muted-color: ${style.mutedTextColor};
      color: ${style.textColor} !important;
      background-color: ${style.paperColor} !important;
      background-image: ${texture.backgroundImage} !important;
      background-size: ${texture.backgroundSize} !important;
      background-position: ${texture.backgroundPosition} !important;
      background-blend-mode: ${texture.backgroundBlendMode} !important;
    }
    html, body {
      color: ${style.textColor} !important;
      background-color: transparent !important;
      overscroll-behavior: contain;
      touch-action: pan-y;
      -webkit-user-select: text;
      user-select: text;
    }
    html.learning-center-custom-mobile-selection,
    html.learning-center-custom-mobile-selection body {
      touch-action: none !important;
    }
    html.learning-center-custom-mobile-selection body,
    html.learning-center-custom-mobile-selection body * {
      -webkit-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
    }
    ${mobileSelectionStyles}
    ${desktopTextCursorStyles}
    body {
      box-sizing: border-box !important;
      padding-inline: ${pagePadding} !important;
      font-family: ${fontFamily} !important;
      font-size: ${style.fontSize}px !important;
      line-height: ${style.density.lineHeight} !important;
      letter-spacing: ${style.density.letterSpacing} !important;
    }
    body, body :where(p, div, span, li, blockquote, dd, dt, h1, h2, h3, h4, h5, h6) {
      color: ${style.textColor} !important;
      font-family: ${fontFamily} !important;
    }
    ${readerProseStyles.replaceAll('.reader-prose', 'body')}
    a, a:link, a:visited {
      color: ${style.accentColor} !important;
    }
    blockquote {
      color: ${style.mutedTextColor} !important;
      border-inline-start-color: ${style.accentColor} !important;
    }
    img, svg, video {
      max-width: 100% !important;
    }
    ::selection {
      color: ${style.textColor};
      background: ${style.highlightColor};
    }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `;
}

export function getFoliateContents(view: FoliateView | null | undefined): FoliateRendererContent[] {
  return view?.renderer?.getContents?.() ?? [];
}

export function createFoliateAnnotation(highlight: HighlightItem): ReaderFoliateAnnotation {
  return {
    value: highlight.cfi,
    highlightId: highlight.id,
    kind: highlight.kind,
    comment: highlight.comment,
  };
}

export function expandFoliateHighlightRects(
  rects: FoliateOverlayRect[],
  targetLineHeight: number,
): FoliateOverlayRect[] {
  return rects.map((rect) => {
    const height = Math.max(rect.height, targetLineHeight);
    const verticalOffset = (height - rect.height) / 2;
    return {
      ...rect,
      top: rect.top - verticalOffset,
      bottom: rect.bottom + verticalOffset,
      height,
    };
  });
}

function appendCommentBadge(
  group: SVGElement,
  rects: FoliateOverlayRect[],
  iconTemplate: HTMLElement | null,
) {
  if (!rects.length) return;
  const lastRect = rects.reduce((current, candidate) => {
    if (candidate.top > current.top + 0.5) return candidate;
    if (Math.abs(candidate.top - current.top) > 0.5) return current;
    return candidate.right > current.right ? candidate : current;
  });
  const centerX = lastRect.right;
  const centerY = lastRect.top;
  const badge = document.createElementNS(SVG_NAMESPACE, 'g');
  badge.classList.add('reader-highlight-comment-indicator');
  badge.setAttribute(
    'transform',
    `translate(${centerX - COMMENT_BADGE_SIZE / 2} ${centerY - COMMENT_BADGE_SIZE / 2})`,
  );
  badge.setAttribute('pointer-events', 'none');

  const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
  circle.setAttribute('cx', String(COMMENT_BADGE_SIZE / 2));
  circle.setAttribute('cy', String(COMMENT_BADGE_SIZE / 2));
  circle.setAttribute('r', String(COMMENT_BADGE_SIZE / 2));
  circle.setAttribute('fill', 'var(--reader-highlight-color)');
  badge.append(circle);

  const templateSvg = iconTemplate?.querySelector<SVGSVGElement>('svg');
  if (templateSvg) {
    const icon = templateSvg.cloneNode(true) as SVGSVGElement;
    icon.setAttribute('x', '0');
    icon.setAttribute('y', '0');
    icon.setAttribute('width', String(COMMENT_BADGE_SIZE));
    icon.setAttribute('height', String(COMMENT_BADGE_SIZE));
    icon.style.color = 'var(--reader-highlight-icon-color)';
    badge.append(icon);
  }
  group.append(badge);
}

export function drawFoliateHighlight({
  rects,
  annotation,
  preferences,
  iconTemplate,
}: {
  rects: FoliateOverlayRect[];
  annotation: ReaderFoliateAnnotation;
  preferences: ReaderPreferences;
  iconTemplate: HTMLElement | null;
}) {
  if (annotation.kind === 'term') {
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    group.classList.add('reader-term');
    group.setAttribute('data-highlight-id', annotation.highlightId);
    const color = resolveReaderStyle(preferences).accentColor;
    for (const rect of rects) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const path = document.createElementNS(SVG_NAMESPACE, 'path');
      const baseline = rect.bottom - 1;
      let d = `M ${rect.left} ${baseline}`;
      for (let x = rect.left; x < rect.right; x += 6) {
        const end = Math.min(x + 6, rect.right);
        d += ` Q ${x + (end - x) / 4} ${baseline - 2} ${x + (end - x) / 2} ${baseline} Q ${x + ((end - x) * 3) / 4} ${baseline + 2} ${end} ${baseline}`;
      }
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '1.5');
      group.append(path);
    }
    return group;
  }
  const { group, expandedRects } = drawExpandedFoliateHighlight(rects, preferences);
  group.classList.add('reader-highlight');
  group.setAttribute('data-highlight-id', annotation.highlightId);
  const style = resolveReaderStyle(preferences);
  group.style.setProperty('--reader-highlight-color', style.highlightColor);
  group.style.setProperty('--reader-highlight-icon-color', style.textColor);
  if (annotation.comment?.trim()) appendCommentBadge(group, expandedRects, iconTemplate);
  return group;
}

function drawExpandedFoliateHighlight(rects: FoliateOverlayRect[], preferences: ReaderPreferences) {
  const style = resolveReaderStyle(preferences);
  const expandedRects = expandFoliateHighlightRects(
    rects,
    style.fontSize * style.density.lineHeight,
  );
  const group = Overlayer.highlight(expandedRects, { color: style.highlightColor });
  group.style.setProperty('--overlayer-highlight-opacity', '0.48');
  group.style.setProperty('--overlayer-highlight-blend-mode', style.isDark ? 'screen' : 'multiply');
  return { group, expandedRects };
}

export function drawFoliateActiveSelection({
  rects,
  preferences,
}: {
  rects: FoliateOverlayRect[];
  preferences: ReaderPreferences;
}) {
  const { group } = drawExpandedFoliateHighlight(rects, preferences);
  group.classList.add('reader-active-selection');
  return group;
}

export function rangeToViewportRect(range: Range) {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  const rect =
    rects.reduce<DOMRect | undefined>((current, candidate) => {
      if (!current || candidate.top > current.top + 0.5) return candidate;
      if (Math.abs(candidate.top - current.top) > 0.5) return current;
      return candidate.right > current.right ? candidate : current;
    }, undefined) ?? range.getBoundingClientRect();
  const rangeDocument =
    range.startContainer.nodeType === Node.DOCUMENT_NODE
      ? (range.startContainer as Document)
      : range.startContainer.ownerDocument;
  const frameRect = rangeDocument?.defaultView?.frameElement?.getBoundingClientRect();
  return {
    left: (frameRect?.left ?? 0) + rect.left,
    top: (frameRect?.top ?? 0) + rect.top,
    width: rect.width,
    height: rect.height,
  };
}

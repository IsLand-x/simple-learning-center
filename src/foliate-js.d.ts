declare module 'foliate-js/view.js' {
  export interface FoliateTocItem {
    id?: number | string;
    href: string;
    label: string;
    subitems?: FoliateTocItem[];
  }

  export interface FoliateBookSection {
    id?: string;
    size?: number;
    cfi?: string;
    linear?: string;
    load?: () => Promise<string | null>;
    unload?: () => void;
    createDocument?: () => Promise<Document>;
  }

  export interface FoliateBook {
    dir?: 'ltr' | 'rtl';
    metadata?: Record<string, unknown>;
    toc?: FoliateTocItem[];
    sections: FoliateBookSection[];
    transformTarget?: EventTarget;
    getCover?: () => Promise<Blob | null>;
    destroy?: () => void;
  }

  export interface FoliateRendererContent {
    index: number;
    doc: Document;
    overlayer?: unknown;
  }

  export interface FoliateRenderer extends HTMLElement {
    containerPosition: number;
    getContents: () => FoliateRendererContent[];
    setStyles?: (styles: string | [string, string]) => void;
    render?: () => void;
    scrollBy?: (deltaX: number, deltaY: number) => void;
    snap?: (velocityX: number, velocityY: number) => void;
    cancelTouchScroll?: () => void;
    focusView?: () => void;
  }

  export interface FoliateNavigationTarget {
    index: number;
    anchor?: ((document: Document) => Range | Element | number | null) | Range | Element | number;
  }

  export interface FoliateRelocateDetail {
    cfi?: string;
    fraction?: number;
    range?: Range;
    section?: { current: number; total: number };
    location?: { current: number; next: number; total: number };
    tocItem?: FoliateTocItem | null;
    pageItem?: FoliateTocItem | null;
  }

  export interface FoliateAnnotation {
    value: string;
    highlightId?: string;
    comment?: string;
  }

  export class View extends HTMLElement {
    book: FoliateBook;
    renderer: FoliateRenderer;
    lastLocation?: FoliateRelocateDetail;
    open: (book: string | File | Blob | FoliateBook) => Promise<void>;
    close: () => void;
    init: (options: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>;
    goTo: (target: string | number | { fraction: number }) => Promise<FoliateNavigationTarget | undefined>;
    next: (distance?: number) => Promise<void>;
    prev: (distance?: number) => Promise<void>;
    deselect: () => void;
    getCFI: (index: number, range?: Range) => string;
    resolveNavigation: (target: string | number | { fraction: number }) => FoliateNavigationTarget | undefined;
    addAnnotation: (annotation: FoliateAnnotation, remove?: boolean) => Promise<unknown>;
    deleteAnnotation: (annotation: FoliateAnnotation) => Promise<unknown>;
  }

  export function makeBook(file: string | File | Blob): Promise<FoliateBook>;
}

declare module 'foliate-js/view.js?learning-center-srcdoc-v1' {
  import type { FoliateBook } from 'foliate-js/view.js';

  export function makeBook(file: string | File | Blob): Promise<FoliateBook>;
}

declare module 'foliate-js/overlayer.js' {
  export interface FoliateOverlayRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }

  export type FoliateOverlayDraw = (
    rects: FoliateOverlayRect[],
    options?: Record<string, unknown>,
  ) => SVGElement;

  export class Overlayer {
    static highlight: FoliateOverlayDraw;
  }
}

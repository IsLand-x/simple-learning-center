import type { FoliateBook, View as FoliateView } from 'foliate-js/view.js';
import 'foliate-js/view.js?learning-center-srcdoc-v1';

const SRCDOC_SECTION_PREFIX = 'learning-center-srcdoc:';
const preparedBooks = new WeakSet<FoliateBook>();

interface FoliateTransformDetail {
  data: string | Blob | Promise<string | Blob>;
  name: string;
  type: string;
}

export function createFoliateView() {
  return document.createElement('foliate-view') as FoliateView;
}

function sanitizeEpubMarkup(source: string, mediaType: string, publicPreview: boolean) {
  const normalizedMediaType = mediaType.toLowerCase();
  const parserType: DOMParserSupportedType = normalizedMediaType.includes('svg')
    ? 'image/svg+xml'
    : normalizedMediaType.includes('xml')
      ? 'application/xhtml+xml'
      : 'text/html';
  let document = new DOMParser().parseFromString(source, parserType);
  if (document.querySelector('parsererror')) {
    document = new DOMParser().parseFromString(source, 'text/html');
  }
  document
    .querySelectorAll('script, meta[http-equiv="refresh" i]')
    .forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    });
  });
  if (publicPreview) {
    if (!document.head) {
      const wrapper = window.document.implementation.createHTMLDocument('');
      wrapper.body.append(wrapper.importNode(document.documentElement, true));
      document = wrapper;
    }
    const policy = document.createElement('meta');
    policy.setAttribute('http-equiv', 'Content-Security-Policy');
    policy.setAttribute(
      'content',
      "default-src 'none'; img-src blob: data:; media-src blob: data:; font-src blob: data:; style-src 'unsafe-inline' blob: data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'",
    );
    document.head?.prepend(policy);
    document.querySelectorAll('a,form,base,iframe,object,embed').forEach((element) => {
      if (element.tagName.toLowerCase() !== 'a') element.remove();
      else if (/^(?:https?:|javascript:|data:|\/\/)/i.test(element.getAttribute('href') ?? ''))
        element.removeAttribute('href');
    });
  }
  return new XMLSerializer().serializeToString(document);
}

function decodeHref(value: string) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function createImageSectionMarkup(source: string) {
  const escapedSource = source
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;display:grid;place-items:center;min-height:100vh"><img src="${escapedSource}" alt="" style="display:block;max-width:100%;max-height:100vh"></body></html>`;
}

export function prepareFoliateBookForBrowser(view: FoliateView, publicPreview = false) {
  const { book } = view;
  if (preparedBooks.has(book)) return;
  preparedBooks.add(book);

  const sourceByName = new Map<string, string>();
  const mediaTypeByName = new Map<string, string>();
  book.transformTarget?.addEventListener('data', (event) => {
    const detail = (event as CustomEvent<FoliateTransformDetail>).detail;
    mediaTypeByName.set(detail.name, detail.type);
    mediaTypeByName.set(decodeHref(detail.name), detail.type);
    if (!detail.type.includes('html') && !detail.type.includes('svg')) return;
    detail.data = Promise.resolve(detail.data).then((data) => {
      if (typeof data !== 'string') return data;
      const source = sanitizeEpubMarkup(data, detail.type, publicPreview);
      sourceByName.set(detail.name, source);
      sourceByName.set(decodeHref(detail.name), source);
      return source;
    });
  });

  book.sections.forEach((section) => {
    const load = section.load?.bind(section);
    if (!load) return;
    section.load = async () => {
      const fallbackUrl = await load();
      const sectionId = section.id;
      const decodedSectionId = sectionId ? decodeHref(sectionId) : undefined;
      const source = sectionId
        ? (sourceByName.get(sectionId) ?? sourceByName.get(decodedSectionId ?? ''))
        : undefined;
      if (source) return `${SRCDOC_SECTION_PREFIX}${source}`;
      const mediaType = sectionId
        ? (mediaTypeByName.get(sectionId) ?? mediaTypeByName.get(decodedSectionId ?? ''))
        : undefined;
      if (fallbackUrl && mediaType?.startsWith('image/') && !mediaType.includes('svg')) {
        return `${SRCDOC_SECTION_PREFIX}${createImageSectionMarkup(fallbackUrl)}`;
      }
      if (!section.createDocument) return fallbackUrl;
      const document = await section.createDocument();
      return `${SRCDOC_SECTION_PREFIX}${sanitizeEpubMarkup(
        new XMLSerializer().serializeToString(document),
        document.contentType,
        publicPreview,
      )}`;
    };
  });
}

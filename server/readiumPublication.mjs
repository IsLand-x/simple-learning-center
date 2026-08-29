import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { readFile, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import { statusError } from './errors.mjs';
import { bookPath } from './storage.mjs';

const PUBLICATION_CACHE_LIMIT = 3;
const publicationCache = new Map();

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw statusError(400, '书籍资源路径不正确');
  }
}

function normalizeEntryPath(value) {
  const decoded = decodePath(value).replaceAll('\\', '/');
  const normalized = posix.normalize(decoded).replace(/^\.\//, '');
  if (
    !normalized
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.startsWith('/')
    || normalized.includes('\0')
  ) {
    throw statusError(400, '书籍资源路径不正确');
  }
  return normalized;
}

function encodeEntryPath(value) {
  return value.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function resolveEntryHref(baseDirectory, href) {
  if (typeof href !== 'string' || !href.trim()) {
    throw statusError(400, 'EPUB 资源链接不正确');
  }
  const [withoutFragment, fragment = ''] = href.split('#', 2);
  const [withoutQuery] = withoutFragment.split('?', 1);
  const path = normalizeEntryPath(posix.join(baseDirectory, decodePath(withoutQuery)));
  return { path, fragment };
}

function elementsByLocalName(node, name) {
  const matches = [];
  const candidates = node?.getElementsByTagName?.('*') ?? [];
  for (let index = 0; index < candidates.length; index += 1) {
    if (candidates[index].localName === name || candidates[index].nodeName?.split(':').at(-1) === name) {
      matches.push(candidates[index]);
    }
  }
  return matches;
}

function firstByLocalName(node, name) {
  return elementsByLocalName(node, name)[0];
}

function directChildren(node, name) {
  const matches = [];
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (
      child.nodeType === 1
      && (!name || child.localName === name || child.nodeName?.split(':').at(-1) === name)
    ) {
      matches.push(child);
    }
  }
  return matches;
}

function parseXml(value, label) {
  let parseError = '';
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message) => { parseError = String(message); },
      fatalError: (message) => { parseError = String(message); },
    },
  }).parseFromString(value, 'application/xml');
  if (!document?.documentElement || parseError || elementsByLocalName(document, 'parsererror').length) {
    throw statusError(422, `${label}格式不正确`);
  }
  return document;
}

async function readZipText(zip, path, label = 'EPUB 资源') {
  const entry = zip.file(path);
  if (!entry || entry.dir) throw statusError(422, `${label}不存在`);
  return entry.async('string');
}

function publicationHref(path, fragment = '') {
  return `resources/${encodeEntryPath(path)}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
}

function parseTocList(list, navDirectory) {
  return directChildren(list, 'li').flatMap((listItem) => {
    const anchor = directChildren(listItem).find((child) => {
      const name = child.localName || child.nodeName?.split(':').at(-1);
      return name === 'a';
    });
    const nestedList = directChildren(listItem, 'ol')[0];
    const children = nestedList ? parseTocList(nestedList, navDirectory) : [];
    if (!anchor?.getAttribute('href')) return children;
    try {
      const resolved = resolveEntryHref(navDirectory, anchor.getAttribute('href'));
      const item = {
        href: publicationHref(resolved.path, resolved.fragment),
        title: anchor.textContent?.trim() || '未命名章节',
      };
      if (children.length) item.children = children;
      return [item];
    } catch {
      return children;
    }
  });
}

function parseNcxPoints(parent, ncxDirectory) {
  return directChildren(parent, 'navPoint').flatMap((navPoint) => {
    const contentHref = firstByLocalName(navPoint, 'content')?.getAttribute('src');
    const children = parseNcxPoints(navPoint, ncxDirectory);
    if (!contentHref) return children;
    try {
      const resolved = resolveEntryHref(ncxDirectory, contentHref);
      const item = {
        href: publicationHref(resolved.path, resolved.fragment),
        title: firstByLocalName(firstByLocalName(navPoint, 'navLabel'), 'text')?.textContent?.trim()
          || '未命名章节',
      };
      if (children.length) item.children = children;
      return [item];
    } catch {
      return children;
    }
  });
}

async function parseNavigation(zip, manifestItems, ncxId) {
  const navItem = manifestItems.find((item) => item.properties.split(/\s+/).includes('nav'));
  if (navItem) {
    const document = parseXml(await readZipText(zip, navItem.path, 'EPUB 目录'), 'EPUB 目录');
    const toc = elementsByLocalName(document, 'nav').find((nav) => {
      const type = nav.getAttribute('epub:type')
        || nav.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type')
        || '';
      return type.split(/\s+/).includes('toc');
    });
    const list = toc ? directChildren(toc, 'ol')[0] : undefined;
    if (list) return parseTocList(list, posix.dirname(navItem.path));
  }

  const ncxItem = manifestItems.find((item) => item.id === ncxId)
    ?? manifestItems.find((item) => item.type === 'application/x-dtbncx+xml');
  if (!ncxItem) return [];
  const document = parseXml(await readZipText(zip, ncxItem.path, 'EPUB NCX 目录'), 'EPUB NCX 目录');
  const navMap = firstByLocalName(document, 'navMap');
  return navMap ? parseNcxPoints(navMap, posix.dirname(ncxItem.path)) : [];
}

function metadataText(metadata, name) {
  return firstByLocalName(metadata, name)?.textContent?.trim() || undefined;
}

async function buildPublication(bookId, zip) {
  const containerDocument = parseXml(
    await readZipText(zip, 'META-INF/container.xml', 'EPUB container.xml'),
    'EPUB container.xml',
  );
  const rootfile = firstByLocalName(containerDocument, 'rootfile');
  const packagePath = normalizeEntryPath(rootfile?.getAttribute('full-path') || '');
  const packageDirectory = posix.dirname(packagePath) === '.' ? '' : posix.dirname(packagePath);
  const packageDocument = parseXml(await readZipText(zip, packagePath, 'EPUB OPF'), 'EPUB OPF');
  const metadata = firstByLocalName(packageDocument, 'metadata');
  const manifest = firstByLocalName(packageDocument, 'manifest');
  const spine = firstByLocalName(packageDocument, 'spine');
  if (!metadata || !manifest || !spine) throw statusError(422, 'EPUB OPF 结构不完整');

  const manifestItems = directChildren(manifest, 'item').map((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const type = item.getAttribute('media-type') || 'application/octet-stream';
    if (!id || !href) return null;
    const { path } = resolveEntryHref(packageDirectory, href);
    return {
      id,
      path,
      type,
      properties: item.getAttribute('properties') || '',
    };
  }).filter(Boolean);
  const byId = new Map(manifestItems.map((item) => [item.id, item]));
  const readingOrderIds = directChildren(spine, 'itemref')
    .filter((item) => item.getAttribute('linear') !== 'no')
    .map((item) => item.getAttribute('idref'))
    .filter(Boolean);
  const readingOrderItems = readingOrderIds.map((id) => byId.get(id)).filter(Boolean);
  if (!readingOrderItems.length) throw statusError(422, 'EPUB 不包含可阅读的章节');

  const readingOrderSet = new Set(readingOrderIds);
  const title = metadataText(metadata, 'title') || '未命名书籍';
  const identifier = metadataText(metadata, 'identifier') || bookId;
  const language = metadataText(metadata, 'language');
  const creators = elementsByLocalName(metadata, 'creator')
    .map((element) => element.textContent?.trim())
    .filter(Boolean);
  const renditionLayout = elementsByLocalName(metadata, 'meta').find(
    (element) => element.getAttribute('property') === 'rendition:layout',
  )?.textContent?.trim();
  const pageProgression = spine.getAttribute('page-progression-direction');
  const metadataJson = {
    '@type': 'http://schema.org/Book',
    title,
    identifier,
    ...(creators.length ? { author: creators } : {}),
    ...(language ? { language: [language] } : {}),
    ...(renditionLayout === 'pre-paginated' ? { layout: 'fixed' } : {}),
    ...(pageProgression === 'rtl' ? { readingProgression: 'rtl' } : {}),
  };

  const toLink = (item) => ({
    href: publicationHref(item.path),
    type: item.type,
    ...(item.properties.split(/\s+/).includes('cover-image') ? { rel: ['cover'] } : {}),
  });

  return {
    '@context': ['https://readium.org/webpub-manifest/context.jsonld'],
    metadata: metadataJson,
    links: [{
      href: `/api/readium/books/${encodeURIComponent(bookId)}/manifest.json`,
      type: 'application/webpub+json',
      rel: ['self'],
    }],
    readingOrder: readingOrderItems.map(toLink),
    resources: manifestItems.filter((item) => !readingOrderSet.has(item.id)).map(toLink),
    toc: await parseNavigation(zip, manifestItems, spine.getAttribute('toc')),
  };
}

async function loadPublication(bookId) {
  const path = bookPath(bookId);
  let fileStats;
  try {
    fileStats = await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') throw statusError(404, '书籍文件不存在');
    throw error;
  }
  const cacheKey = `${fileStats.size}:${fileStats.mtimeMs}`;
  const cached = publicationCache.get(path);
  if (cached?.cacheKey === cacheKey) {
    publicationCache.delete(path);
    publicationCache.set(path, cached);
    return cached;
  }
  const zip = await JSZip.loadAsync(await readFile(path), { checkCRC32: false });
  const publication = await buildPublication(bookId, zip);
  const loaded = { cacheKey, zip, publication };
  publicationCache.set(path, loaded);
  while (publicationCache.size > PUBLICATION_CACHE_LIMIT) {
    publicationCache.delete(publicationCache.keys().next().value);
  }
  return loaded;
}

export async function readiumManifest(bookId) {
  return (await loadPublication(bookId)).publication;
}

export async function readiumResource(bookId, resourcePath) {
  const normalized = normalizeEntryPath(resourcePath);
  const { zip, publication } = await loadPublication(bookId);
  const entry = zip.file(normalized);
  if (!entry || entry.dir) throw statusError(404, '书籍资源不存在');
  return {
    body: await entry.async('nodebuffer'),
    type: publication.readingOrder
      .concat(publication.resources ?? [])
      .find((item) => decodePath(item.href.replace(/^resources\//, '').split('#', 1)[0]) === normalized)
      ?.type || 'application/octet-stream',
  };
}

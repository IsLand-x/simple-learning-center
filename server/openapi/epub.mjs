import yauzl from 'yauzl';
import { DOMParser } from '@xmldom/xmldom';
import { posix } from 'node:path';
import { statusError } from '../errors.mjs';

const XML_LIMIT = 4 * 1024 * 1024;

function parseXml(data) {
  const xml = data.toString('utf8');
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml)) throw new Error('不支持 XML 实体声明');
  return new DOMParser({
    errorHandler: {
      warning() {},
      error() {
        throw new Error('XML 格式错误');
      },
      fatalError() {
        throw new Error('XML 格式错误');
      },
    },
  }).parseFromString(xml, 'application/xml');
}
const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));

export async function readEpubMetadata(path) {
  let zip;
  try {
    zip = await new Promise((resolve, reject) =>
      yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, value) =>
        error ? reject(error) : resolve(value),
      ),
    );
    const entries = new Map();
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry) => {
        if (entries.size >= 20000 || entries.has(entry.fileName))
          return reject(new Error('EPUB 条目过多或重复'));
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.readEntry();
    });
    async function read(name, limit = XML_LIMIT) {
      const entry = entries.get(name);
      if (!entry || entry.uncompressedSize > limit) throw new Error('EPUB 条目缺失或过大');
      const stream = await new Promise((resolve, reject) =>
        zip.openReadStream(entry, (error, value) => (error ? reject(error) : resolve(value))),
      );
      const chunks = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > limit) {
          stream.destroy();
          throw new Error('EPUB 条目过大');
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    if ((await read('mimetype', 100)).toString().trim() !== 'application/epub+zip')
      throw new Error('不是 EPUB');
    const container = parseXml(await read('META-INF/container.xml'));
    const root = elements(container, 'rootfile')[0]?.getAttribute('full-path');
    const opf = parseXml(await read(root));
    if (!elements(opf, 'spine').length || !elements(opf, 'manifest').length)
      throw new Error('EPUB 缺少阅读结构');
    const items = elements(opf, 'item');
    const resolveHref = (href) =>
      posix.normalize(posix.join(posix.dirname(root), decodeURIComponent(href)));
    const spineItems = elements(opf, 'itemref');
    if (
      !spineItems.length ||
      spineItems.some((ref) => {
        const item = items.find((entry) => entry.getAttribute('id') === ref.getAttribute('idref'));
        return !item || !entries.has(resolveHref(item.getAttribute('href')));
      })
    )
      throw new Error('EPUB 缺少章节文件');
    const coverId = elements(opf, 'meta')
      .find((item) => item.getAttribute('name') === 'cover')
      ?.getAttribute('content');
    const cover = items.find(
      (item) =>
        item.getAttribute('properties').split(/\s+/).includes('cover-image') ||
        (coverId && item.getAttribute('id') === coverId),
    );
    let coverDataUrl;
    if (cover && /^image\/(png|jpeg|gif|webp|avif)$/.test(cover.getAttribute('media-type'))) {
      const data = await read(resolveHref(cover.getAttribute('href')), 8 * 1024 * 1024);
      coverDataUrl = `data:${cover.getAttribute('media-type')};base64,${data.toString('base64')}`;
    }
    let toc = [];
    const children = (node, name) =>
      Array.from(node?.childNodes || []).filter(
        (child) => child.nodeType === 1 && child.localName === name,
      );
    const hrefFrom = (file, href) => {
      const resolved = new URL(href, `https://epub.invalid/${file}`);
      if (resolved.origin !== 'https://epub.invalid') throw new Error('目录地址无效');
      return resolved.pathname.slice(1) + resolved.hash;
    };
    const nav = items.find((item) => item.getAttribute('properties').split(/\s+/).includes('nav'));
    if (nav) {
      const navPath = resolveHref(nav.getAttribute('href'));
      const doc = parseXml(await read(navPath));
      const tocNav = elements(doc, 'nav').find((item) =>
        (item.getAttribute('epub:type') || item.getAttribute('type')).split(/\s+/).includes('toc'),
      );
      const mapList = (list) =>
        children(list, 'li').map((li, index) => {
          const anchor = children(li, 'a')[0];
          const label = anchor || children(li, 'span')[0];
          return {
            id: li.getAttribute('id') || `toc-${index}-${anchor?.getAttribute('href') || ''}`,
            href: anchor ? hrefFrom(navPath, anchor.getAttribute('href')) : '',
            label: label?.textContent.trim() || '未命名章节',
            subitems: mapList(children(li, 'ol')[0]),
          };
        });
      if (tocNav) toc = mapList(children(tocNav, 'ol')[0]);
    }
    if (!toc.length) {
      const ncx =
        items.find(
          (item) => item.getAttribute('id') === elements(opf, 'spine')[0]?.getAttribute('toc'),
        ) || items.find((item) => item.getAttribute('media-type') === 'application/x-dtbncx+xml');
      if (ncx) {
        const ncxPath = resolveHref(ncx.getAttribute('href'));
        const doc = parseXml(await read(ncxPath));
        const mapPoints = (parent) =>
          children(parent, 'navPoint').map((point, index) => {
            const href = children(point, 'content')[0]?.getAttribute('src');
            return {
              id: point.getAttribute('id') || `toc-${index}`,
              href: href ? hrefFrom(ncxPath, href) : '',
              label: elements(point, 'text')[0]?.textContent.trim() || '未命名章节',
              subitems: mapPoints(point),
            };
          });
        toc = mapPoints(elements(doc, 'navMap')[0]);
      }
    }
    return {
      title: elements(opf, 'title')[0]?.textContent.trim(),
      author: elements(opf, 'creator')[0]?.textContent.trim(),
      coverDataUrl,
      toc,
    };
  } catch {
    throw statusError(400, 'EPUB 文件无效、损坏或元数据超过限制');
  } finally {
    zip?.close();
  }
}

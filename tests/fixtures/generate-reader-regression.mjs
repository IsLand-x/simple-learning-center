// Deterministic, uncompressed EPUB fixture. All prose below is authored for this test suite.
import { writeFile } from 'node:fs/promises';

const paragraphs = Array.from(
  { length: 40 },
  (_, index) =>
    `<p>第 ${index + 1} 段。阅读时先提出问题，再用自己的语言记录理解。通过回顾和核对原文，我们可以发现概念之间的联系，也能修正遗漏的条件。这些原创文字只用于验证阅读器分页、目录和位置恢复。</p>`,
).join('');
const chapter = (title, introduction) =>
  `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><h1>${title}</h1><p>${introduction}</p>${paragraphs}</body></html>`;
const files = {
  mimetype: 'application/epub+zip',
  'META-INF/container.xml':
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  'EPUB/package.opf':
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-regression-test</dc:identifier><dc:title>阅读器回归测试</dc:title><dc:creator>自动化测试</dc:creator><dc:language>zh</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/><item id="nav" properties="nav" href="nav.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/><itemref idref="chapter2"/></spine></package>',
  'EPUB/chapter.xhtml': chapter('第一章', '用于验证导入的原创测试内容。'),
  'EPUB/chapter2.xhtml': chapter('第二章', '从这里开始验证目录跳转和阅读位置恢复。'),
  'EPUB/nav.xhtml':
    '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">第一章</a></li><li><a href="chapter2.xhtml">第二章</a></li></ol></nav></body></html>',
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP STORE entries keep this generator independent of external archive packages.
const entries = [];
const directory = [];
let offset = 0;
for (const [fileName, content] of Object.entries(files)) {
  const name = Buffer.from(fileName);
  const body = Buffer.from(content);
  const checksum = crc32(body);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(((2026 - 1980) << 9) | (9 << 5) | 26, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(body.length, 22);
  header.writeUInt16LE(name.length, 26);
  entries.push(header, name, body);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  header.copy(entry, 6, 4, 30);
  entry.writeUInt32LE(offset, 42);
  directory.push(entry, name);
  offset += header.length + name.length + body.length;
}
const centralDirectory = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(Object.keys(files).length, 8);
end.writeUInt16LE(Object.keys(files).length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
await writeFile(
  new URL('./reader-regression.epub', import.meta.url),
  Buffer.concat([...entries, centralDirectory, end]),
);

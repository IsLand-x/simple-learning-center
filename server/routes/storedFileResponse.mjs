import { extname } from 'node:path';
import { exists, fileResponse } from '../storage.mjs';

const MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.epub', 'application/epub+zip'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

export async function storedFileResponse(c, path) {
  if (!(await exists(path))) return c.json({ error: '文件不存在' }, 404);
  const response = await fileResponse(path, c.req.method);
  if (!response) return c.json({ error: '文件不存在' }, 404);
  response.headers.set(
    'Content-Type',
    MIME_TYPES.get(extname(path).toLowerCase()) || 'application/octet-stream',
  );
  return response;
}

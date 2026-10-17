import type { ImageHostingResult } from '../../books/imageHosting.js';

export function imageHostingMarkdown(result: ImageHostingResult) {
  if (result.cosUrl) return `\n\n[COS 原图链接（公开访问）](${result.cosUrl})`;
  if (result.uploadWarning) return `\n\n${result.uploadWarning}`;
  return '';
}

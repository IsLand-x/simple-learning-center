import type { ImageHostingResult } from '../../books/imageHosting.js';

export function imageHostingMarkdown(
  title: string,
  result: ImageHostingResult & { imageUrl: string },
) {
  const imageUrl = result.cosUrl ?? result.imageUrl;
  const hosting = result.cosUrl
    ? `\n\n[COS 原图链接（公开访问）](${result.cosUrl})`
    : result.uploadWarning
      ? `\n\n${result.uploadWarning}`
      : '';
  return `![${title}](${imageUrl})\n\n[查看或保存原图](${imageUrl})${hosting}`;
}

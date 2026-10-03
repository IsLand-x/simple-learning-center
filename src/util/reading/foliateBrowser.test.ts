import { expect, it, vi } from 'vitest';
import type { View, FoliateBook } from 'foliate-js/view.js';
vi.mock('foliate-js/view.js?learning-center-srcdoc-v1', () => ({}));
import { prepareFoliateBookForBrowser } from './foliateBrowser';

it('公开章节移除可执行内容并阻止外部网络，私人章节保留现有资源策略', async () => {
  const source =
    '<html><head></head><body onload="steal()"><script>steal()</script><p>正文</p><a href="https://example.com">外链</a><form action="/api/private"><input /></form><iframe src="/api/state"></iframe></body></html>';
  const create = (publicPreview: boolean) => {
    const section = {
      load: async () => 'blob:epub',
      createDocument: async () => new DOMParser().parseFromString(source, 'text/html'),
    };
    const book: FoliateBook = { sections: [section] };
    prepareFoliateBookForBrowser({ book } as View, publicPreview);
    return section.load();
  };
  const publicSource = await create(true);
  expect(publicSource).toContain('正文');
  expect(publicSource).not.toContain('<script');
  expect(publicSource).not.toContain('onload');
  expect(publicSource).not.toContain('<iframe');
  expect(publicSource).not.toContain('<form');
  expect(publicSource).not.toContain('href="https:');
  expect(publicSource).toContain('Content-Security-Policy');
  expect(publicSource).toContain("connect-src 'none'");
  expect(await create(false)).not.toContain('Content-Security-Policy');
});

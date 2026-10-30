import { act, createElement, Suspense, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIBRARY_STATE_DOMAINS,
  READER_STATE_DOMAINS,
  SETTINGS_STATE_DOMAINS,
} from '../store/stateDomains';
import { AppRoutes } from './AppRoutes';

vi.mock('../pages/books/list/index', () => ({
  LibraryPage: () => createElement('h1', null, '我的书架'),
}));
vi.mock('../pages/books/detail/index', () => ({
  ReaderPage: () => createElement('h1', null, '书籍阅读器'),
}));
vi.mock('../pages/settings/index', () => ({
  SettingsPage: () => createElement('h1', null, '设置'),
}));
vi.mock('../pages/books/detail/components/ReaderSurface/ReaderErrorBoundary', () => ({
  ReaderErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/DomainRoute', () => ({
  DomainRoute: ({ children, domains }: { children: ReactNode; domains: readonly string[] }) =>
    createElement('main', { 'data-domains': domains.join(',') }, children),
}));

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return createElement('output', null, `${location.pathname}${location.search}:${navigationType}`);
}

describe('书籍核心路由', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function visit(path: string) {
    await act(async () => {
      root.render(
        createElement(
          Suspense,
          { fallback: '正在加载…' },
          createElement(
            MemoryRouter,
            { initialEntries: [path] },
            createElement(AppRoutes),
            createElement(LocationProbe),
          ),
        ),
      );
    });
  }

  it.each([
    { path: '/', title: '我的书架', domains: LIBRARY_STATE_DOMAINS },
    { path: '/books/book-a', title: '书籍阅读器', domains: READER_STATE_DOMAINS },
    { path: '/settings', title: '设置', domains: SETTINGS_STATE_DOMAINS },
  ])('保留 $path 及对应状态分区', async ({ path, title, domains }) => {
    await visit(path);
    expect(container.querySelector('h1')).toHaveTextContent(title);
    expect(container.querySelector('main')).toHaveAttribute('data-domains', domains.join(','));
    expect(container.querySelector('output')).toHaveTextContent(`${path}:POP`);
  });

  it.each([
    '/rss',
    '/rss?source=all&range=all&item=article&view=detail&panel=ai',
    '/rss/article',
    '/videos',
    '/videos?video=old-video',
  ])('将已移除入口 %s 替换为书架', async (path) => {
    await visit(path);
    expect(container.querySelector('h1')).toHaveTextContent('我的书架');
    expect(container.querySelector('main')).toHaveAttribute(
      'data-domains',
      LIBRARY_STATE_DOMAINS.join(','),
    );
    expect(container.querySelector('output')).toHaveTextContent('/:REPLACE');
  });
});

import { act, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RssItem } from '../../../../contracts/rss';
import { aiApi } from '../../../api/ai';
import type { AiJob } from '../../../api/ai/type';
import { rssApi } from '../../../api/rss';
import { initialLearningState } from '../../../store/defaults';
import { useLearningStore } from '../../../store/useLearningStore';
import { useAddSource } from './components/SourcesPanel/useAddSource';
import { rssProbeObservers } from './fixtures/probes';
import { RssPage } from './index';
import type { WorkspaceContextValue } from './store/workspaceTypes';

vi.mock('@douyinfe/semi-ui', () => ({
  Toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  Modal: { confirm: vi.fn() },
}));
vi.mock('../../../store/serverStateStorage', () => ({
  serverStateStorage: { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() },
  waitForServerStateWrites: vi.fn(async () => undefined),
}));
vi.mock('../../../store/learningStateSync', () => ({ synchronizeLearningState: vi.fn() }));
vi.mock('../../../util/reading/readerFonts', async (original) => ({
  ...(await original<typeof import('../../../util/reading/readerFonts')>()),
  ensureReaderFontStylesheet: vi.fn(),
}));
// Replace only presentation leaves. The real page owner, navigation, drafts and task
// subscriptions remain mounted exactly as they are in the application.
vi.mock('./components/DesktopWorkspace', async () => ({
  DesktopWorkspace: (await import('./fixtures/WorkspaceProbe')).WorkspaceProbe,
}));
vi.mock('./components/MobileWorkspace/MobileWorkspace', async () => ({
  MobileWorkspace: (await import('./fixtures/WorkspaceProbe')).WorkspaceProbe,
}));
vi.mock('./components/SourcesPanel/SourceDialogs', async () => ({
  SourceDialogs: (await import('./fixtures/SubscriptionDraftProbe')).SubscriptionDraftProbe,
}));
vi.mock('./components/DigestPanel/DigestSettings', () => ({ DigestSettings: () => null }));
vi.mock('./components/ArticlePanel/ArticleOverlays', () => ({ ArticleOverlays: () => null }));
vi.mock('./components/ItemsPanel/ItemMenu', () => ({ ItemMenu: () => null }));

let workspace: WorkspaceContextValue['navigation'];
let sources: WorkspaceContextValue['sources'];
let article: WorkspaceContextValue['article'];
let tasks: WorkspaceContextValue['tasks'];
let draft: ReturnType<typeof useAddSource>;
let navigate: NavigateFunction;
let route = '';
const makeItem = (id: string): RssItem => ({
  id,
  feedId: 'feed',
  title: id,
  link: `https://example.test/${id}`,
  publishedAt: Date.now(),
  fetchedAt: Date.now(),
  contentText: 'Article content',
  aiSummary: 'Existing summary',
  aiSummaryVersion: 2,
});
const job: AiJob = {
  id: 'translation-job',
  bookId: 'rss:first',
  conversationId: 'rss-translation-v2:first',
  userMessageId: 'user',
  assistantMessageId: 'assistant',
  status: 'running',
  revision: 1,
  content: '',
  dialogueContent: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('RSS workspace ownership across navigation and layout changes', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let mobile: boolean;
  let media: Set<() => void>;
  const resize = (next: boolean) => {
    mobile = next;
    media.forEach((update) => update());
  };

  beforeEach(() => {
    rssProbeObservers.workspace = (value, nextNavigate, nextRoute) => {
      workspace = value.navigation;
      sources = value.sources;
      article = value.article;
      tasks = value.tasks;
      navigate = nextNavigate;
      route = nextRoute;
    };
    rssProbeObservers.draft = (value) => {
      draft = value;
    };
    mobile = false;
    media = new Set();
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return mobile;
      },
      addEventListener: (_type: string, update: () => void) => media.add(update),
      removeEventListener: (_type: string, update: () => void) => media.delete(update),
    }));
    useLearningStore.setState({
      ...initialLearningState,
      rssFeeds: [
        {
          id: 'feed',
          title: 'Feed',
          url: 'https://example.test/feed',
          source: { kind: 'rss', feedUrl: 'https://example.test/feed' },
          type: 'article',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      rssItems: [makeItem('first'), makeItem('second')],
      openAIConfigs: [
        {
          id: 'model',
          name: 'test',
          baseUrl: 'https://example.test',
          apiKey: '',
          models: ['test'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  const mount = async () => {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/rss?source=all&item=first&range=all&view=detail']}>
          <RssPage />
        </MemoryRouter>,
      ),
    );
  };

  it('retains an unfinished subscription across close, layout switch and source navigation', async () => {
    await mount();
    act(() => {
      sources.setAddVisible(true);
      draft.onChangeFeedTitle('未完成的订阅');
      draft.onChangeFeedUrl('https://example.test/new');
      draft.onChangeFeedType('social');
      sources.setAddVisible(false);
    });
    await act(async () => resize(true));
    await act(async () => workspace.selectSource('unread'));
    act(() => sources.setAddVisible(true));
    expect(draft.feedTitle).toBe('未完成的订阅');
    expect(draft.feedUrl).toBe('https://example.test/new');
    expect(draft.feedType).toBe('social');
    act(() => sources.setCreatedFolderId('new-folder'));
    expect(draft.feedFolderId).toBe('new-folder');

    vi.spyOn(rssApi, 'resolveSource').mockResolvedValue({
      source: { kind: 'rss', feedUrl: 'https://example.test/feed' },
      result: {
        title: 'Feed',
        feedUrl: 'https://example.test/feed',
        description: '',
        siteUrl: '',
        fetchedAt: 1,
        items: [],
      },
    });
    await act(async () => draft.onSubmit({ preventDefault() {} } as FormEvent));
    expect(sources.addVisible).toBe(false);
    expect(draft.feedTitle).toBe('未完成的订阅'); // Duplicate closes without erasing the draft.
    expect(draft.feedFolderId).toBe('new-folder');
  });

  it('keeps one translation subscription while panels, layouts and articles change', async () => {
    vi.spyOn(aiApi, 'listJobs').mockResolvedValue([]);
    vi.spyOn(aiApi, 'startJob').mockResolvedValue(job);
    let publish: (value: AiJob) => void = () => undefined;
    let finish: () => void = () => undefined;
    const watch = vi.spyOn(aiApi, 'watchJob').mockImplementation(async (_id, listener) => {
      publish = listener;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await mount();
    let translating: Promise<void | undefined>;
    await act(async () => {
      translating = tasks.translateCurrentPage();
    });
    expect(tasks.translationStatus).toBe('generating');
    expect(watch).toHaveBeenCalledTimes(1);
    await act(async () => resize(true));
    await act(async () => workspace.changeMobilePanel('ai'));
    await act(async () => workspace.changeMobilePanel('style'));
    await act(async () => workspace.openItem(useLearningStore.getState().rssItems[1]));
    await act(async () => resize(false));
    await act(async () => workspace.openItem(useLearningStore.getState().rssItems[0]));
    expect(tasks.translationStatus).toBe('generating');
    expect(watch).toHaveBeenCalledTimes(1);
    act(() =>
      publish({
        ...job,
        status: 'completed',
        content: '翻译内容',
        translationHtml: '<p>翻译内容</p>',
      }),
    );
    await act(async () => {
      finish();
      await translating;
    });
    expect(
      useLearningStore.getState().rssItems.find((item) => item.id === 'first')?.aiTranslation,
    ).toBe('翻译内容');
    expect(
      useLearningStore.getState().rssItems.find((item) => item.id === 'second')?.aiTranslation,
    ).toBeUndefined();
    expect(tasks.translationStatus).toBe('ready');
  });

  it('cancels the previous summary listener and ignores its late result after an article change', async () => {
    useLearningStore.setState({
      rssItems: useLearningStore
        .getState()
        .rssItems.map((item) => ({ ...item, aiSummary: undefined, aiSummaryVersion: undefined })),
    });
    const subscriptions = new Map<
      string,
      { signal: AbortSignal; publish: (value: AiJob) => void }
    >();
    vi.spyOn(aiApi, 'listJobs').mockImplementation(async ({ bookId }) => [
      {
        ...job,
        id: `summary:${bookId}`,
        bookId,
        purpose: 'summary',
        conversationId: `rss-summary-v2:${bookId.slice(4)}`,
      },
    ]);
    const watch = vi.spyOn(aiApi, 'watchJob').mockImplementation(async (id, publish, signal) => {
      subscriptions.set(id, { signal, publish });
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    });
    await mount();
    const first = subscriptions.get('summary:rss:first');
    expect(first).toBeDefined();
    await act(async () => workspace.openItem(useLearningStore.getState().rssItems[1]));
    expect(first?.signal.aborted).toBe(true);
    expect(watch).toHaveBeenCalledTimes(2);
    act(() => first?.publish({ ...job, status: 'completed', content: '迟到的第一篇摘要' }));
    expect(useLearningStore.getState().rssItems.every((item) => !item.aiSummary)).toBe(true);
    act(() =>
      subscriptions
        .get('summary:rss:second')
        ?.publish({ ...job, status: 'completed', content: '第二篇摘要' }),
    );
    expect(workspace.selectedItem?.id).toBe('second');
    expect(
      useLearningStore.getState().rssItems.find((item) => item.id === 'first')?.aiSummary,
    ).toBeUndefined();
    expect(
      useLearningStore.getState().rssItems.find((item) => item.id === 'second')?.aiSummary,
    ).toBe('第二篇摘要');
    expect(tasks.summaryStatus).toBe('ready');
  });

  it('uses browser history as the source for mobile panel and article navigation', async () => {
    mobile = true;
    await mount();
    await act(async () => workspace.changeMobilePanel('ai'));
    await act(async () => workspace.changeMobilePanel('style'));
    expect(new URLSearchParams(route).get('panel')).toBe('style');
    await act(async () => navigate(-1));
    expect(workspace.mobilePanel).toBeNull();
    expect(workspace.selectedItem?.id).toBe('first');
    await act(async () => workspace.openItem(useLearningStore.getState().rssItems[1]));
    expect(workspace.selectedItem?.id).toBe('second');
    act(() => article.setCommentDraft('第二篇的草稿'));
    await act(async () => navigate(-1));
    expect(workspace.selectedItem?.id).toBe('first');
    expect(article.commentDraft).toBe('');
    expect(new URLSearchParams(route).get('item')).toBe('first');
  });
});

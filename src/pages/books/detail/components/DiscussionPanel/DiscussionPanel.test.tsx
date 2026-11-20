import { act, createElement, type ChangeEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookItem } from '../../../../../../contracts/books';
import type { DiscussionItem, MindMapSource } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { DiscussionPanel } from './DiscussionPanel';

vi.mock('../../../../../store/learningStateSync', () => ({
  synchronizeLearningState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@douyinfe/semi-ui', () => ({
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel,
    type,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
    type?: 'primary' | 'secondary' | 'tertiary' | 'warning' | 'danger';
  }) => createElement('button', { onClick, 'aria-label': ariaLabel, type }, children),
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) =>
    createElement('input', {
      value,
      placeholder,
      onChange: (e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value),
    }),
  Empty: ({ title, description }: { title?: ReactNode; description?: ReactNode }) =>
    createElement(
      'div',
      null,
      createElement('div', null, title),
      createElement('div', null, description),
    ),
  Typography: {
    Text: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('span', props, children),
  },
}));

vi.mock('@douyinfe/semi-icons', () => ({
  IconComment: () => createElement('span', { 'data-testid': 'icon-comment' }),
}));

vi.mock('./DiscussionEditor', () => ({
  DiscussionEditor: ({ discussion, onBack }: { discussion: DiscussionItem; onBack: () => void }) =>
    createElement(
      'div',
      { 'data-testid': 'discussion-editor' },
      createElement('button', { onClick: onBack, 'aria-label': '返回问题列表' }, '返回问题列表'),
      createElement('span', null, discussion.question),
    ),
}));

const mockBook: BookItem = {
  id: 'test-book-id',
  kind: 'epub',
  title: '测试书籍',
  author: '作者',
  fileName: 'test.epub',
  fileSize: 1024,
  progress: 0,
  currentCfi: '',
  currentChapter: '第一章',
  createdAt: 1000,
  updatedAt: 1000,
  toc: [],
};

const mockSource: MindMapSource = {
  passageId: 'passage-1',
  chapter: '第一章',
  href: 'chap1.html',
  cfi: '/6/2',
  quote: '',
};

describe('DiscussionPanel mobile history navigation', () => {
  const originalState = window.history.state;
  const originalHref = window.location.href;

  beforeEach(() => {
    window.history.replaceState({ learningCenterMobileOverlay: 'overlay-1' }, '', originalHref);
    useLearningStore.setState({
      discussions: [
        {
          id: 'disc-1',
          bookId: mockBook.id,
          question: '测试讨论一',
          content: '测试内容',
          source: mockSource,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
  });

  afterEach(() => {
    window.history.replaceState(originalState, '', originalHref);
    vi.restoreAllMocks();
  });

  it('swiping back returns from discussion detail to discussion list on mobile', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          createElement(DiscussionPanel, {
            book: mockBook,
            mobile: true,
            getSource: () => mockSource,
          }),
        );
      });

      // Initially on discussion list
      expect(container.querySelector('[data-testid="discussion-editor"]')).toBeNull();
      const itemButton = container.querySelector('button[type="button"]') as HTMLButtonElement;
      expect(itemButton.textContent).toContain('测试讨论一');

      // Click to open detail
      await act(async () => {
        itemButton.click();
      });

      // Now detail is open
      expect(container.querySelector('[data-testid="discussion-editor"]')).not.toBeNull();
      expect(window.history.state.learningCenterDiscussionDetail).toBeDefined();
      expect(window.history.state.learningCenterMobileOverlay).toBe('overlay-1');

      // Simulate mobile side-swipe back (popstate to state without discussion detail)
      await act(async () => {
        window.history.replaceState(
          { learningCenterMobileOverlay: 'overlay-1' },
          '',
          window.location.href,
        );
        window.dispatchEvent(
          new PopStateEvent('popstate', {
            state: { learningCenterMobileOverlay: 'overlay-1' },
          }),
        );
      });

      // Detail is closed, list is visible again
      expect(container.querySelector('[data-testid="discussion-editor"]')).toBeNull();
      expect(container.textContent).toContain('测试讨论一');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('clicking back button in editor returns to list and pops history', async () => {
    const backSpy = vi.spyOn(window.history, 'back');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          createElement(DiscussionPanel, {
            book: mockBook,
            mobile: true,
            getSource: () => mockSource,
          }),
        );
      });

      // Click to open detail
      const itemButton = container.querySelector('button[type="button"]') as HTMLButtonElement;
      await act(async () => {
        itemButton.click();
      });
      expect(container.querySelector('[data-testid="discussion-editor"]')).not.toBeNull();

      // Click back in editor
      const backButton = container.querySelector(
        'button[aria-label="返回问题列表"]',
      ) as HTMLButtonElement;
      await act(async () => {
        backButton.click();
      });

      // Returns to list and called history.back()
      expect(container.querySelector('[data-testid="discussion-editor"]')).toBeNull();
      expect(backSpy).toHaveBeenCalledOnce();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});

import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderSelectionOverlays } from './ReaderSelectionOverlays';

vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn() } }));

const rect = { left: 900, top: 300, width: 80, height: 24 };
const selection = { text: '原文', cfi: 'epubcfi(/6/2)', rect };
const props: ComponentProps<typeof ReaderSelectionOverlays> = {
  activeHighlightTarget: null,
  commentDraft: '',
  commentingHighlightId: null,
  pendingCommentSelection: null,
  selection,
  onAskAboutSelection: vi.fn(),
  onCancelCommentEditing: vi.fn(),
  onCancelHighlight: vi.fn(),
  onChangeCommentDraft: vi.fn(),
  onCreateComment: vi.fn(),
  onEditHighlightComment: vi.fn(),
  onSaveHighlight: vi.fn(),
  onSaveHighlightComment: vi.fn(),
  onViewHighlight: vi.fn(),
};

describe('选区浮层的常驻视口监听', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each(['selection', 'highlight'] as const)(
    '没有评论编辑器时，%s 工具栏仍响应窗口缩窄',
    (kind) => {
      const changes =
        kind === 'highlight'
          ? {
              selection: null,
              activeHighlight: { id: 'highlight', text: '原文', kind: 'highlight' as const },
              activeHighlightTarget: { highlightId: 'highlight', rect },
            }
          : {};
      act(() => root.render(<ReaderSelectionOverlays {...props} {...changes} />));
      const toolbar = container.querySelector<HTMLElement>('[role="toolbar"]')!;
      expect(toolbar.style.left).toBe('940px');
      expect(container.querySelector('form')).toBeNull();
      act(() => {
        vi.stubGlobal('innerWidth', 700);
        window.dispatchEvent(new Event('resize'));
      });
      expect(toolbar.style.left).toBe(kind === 'selection' ? '580px' : '530px');
    },
  );
});

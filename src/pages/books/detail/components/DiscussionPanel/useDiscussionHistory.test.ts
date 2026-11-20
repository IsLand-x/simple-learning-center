import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiscussionHistory } from './useDiscussionHistory';

describe('useDiscussionHistory', () => {
  const originalState = window.history.state;
  const originalHref = window.location.href;

  beforeEach(() => {
    window.history.replaceState({ initial: true }, '', originalHref);
  });

  afterEach(() => {
    window.history.replaceState(originalState, '', originalHref);
    vi.restoreAllMocks();
  });

  function renderProbe(initialProps: { mobile: boolean; active: boolean; onClose: () => void }) {
    const container = document.createElement('div');
    const root = createRoot(container);
    let currentProps = initialProps;

    function Probe() {
      useDiscussionHistory(currentProps);
      return null;
    }

    return {
      async render(props?: Partial<typeof initialProps>) {
        if (props) {
          currentProps = { ...currentProps, ...props };
        }
        await act(async () => {
          root.render(createElement(Probe));
        });
      },
      async unmount() {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  }

  it('does nothing on desktop when mobile is false', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const onClose = vi.fn();

    const probe = renderProbe({ mobile: false, active: false, onClose });
    await probe.render();

    await probe.render({ active: true });
    expect(pushStateSpy).not.toHaveBeenCalled();

    await probe.render({ active: false });
    expect(onClose).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('pushes history state on mobile when discussion detail becomes active', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const onClose = vi.fn();

    const probe = renderProbe({ mobile: true, active: false, onClose });
    await probe.render();
    expect(pushStateSpy).not.toHaveBeenCalled();

    await probe.render({ active: true });
    expect(pushStateSpy).toHaveBeenCalledOnce();
    const pushedState = pushStateSpy.mock.calls[0][0] as {
      initial?: boolean;
      learningCenterDiscussionDetail?: string;
    };
    expect(pushedState.initial).toBe(true);
    expect(typeof pushedState.learningCenterDiscussionDetail).toBe('string');

    await probe.unmount();
  });

  it('calls onClose when popstate fires (e.g. mobile edge swipe back)', async () => {
    const onClose = vi.fn();

    const probe = renderProbe({ mobile: true, active: false, onClose });
    await probe.render();
    await probe.render({ active: true });

    // Simulate popstate back to state without learningCenterDiscussionDetail
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { initial: true },
        }),
      );
    });

    expect(onClose).toHaveBeenCalledOnce();
    await probe.unmount();
  });

  it('calls history.back when active is closed via UI and cleans up', async () => {
    const backSpy = vi.spyOn(window.history, 'back');
    const onClose = vi.fn();

    const probe = renderProbe({ mobile: true, active: false, onClose });
    await probe.render();
    await probe.render({ active: true });
    expect(backSpy).not.toHaveBeenCalled();

    await probe.render({ active: false });
    expect(backSpy).toHaveBeenCalledOnce();

    await probe.unmount();
  });

  it('cleans up history on unmount while discussion detail is active', async () => {
    const backSpy = vi.spyOn(window.history, 'back');
    const onClose = vi.fn();

    const probe = renderProbe({ mobile: true, active: false, onClose });
    await probe.render();
    await probe.render({ active: true });
    expect(backSpy).not.toHaveBeenCalled();

    await probe.unmount();
    expect(backSpy).toHaveBeenCalledOnce();
  });

  it('does not call history.back on unmount if detail was already closed', async () => {
    const backSpy = vi.spyOn(window.history, 'back');
    const onClose = vi.fn();

    const probe = renderProbe({ mobile: true, active: false, onClose });
    await probe.render();
    await probe.render({ active: true });
    expect(backSpy).not.toHaveBeenCalled();

    // User popped back
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { initial: true },
        }),
      );
    });
    expect(onClose).toHaveBeenCalledOnce();

    await probe.render({ active: false });
    await probe.unmount();

    expect(backSpy).not.toHaveBeenCalled();
  });
});

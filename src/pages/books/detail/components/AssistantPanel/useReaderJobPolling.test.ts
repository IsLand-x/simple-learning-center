import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReaderJobPolling } from './useReaderJobPolling';

const refresh = vi.fn<(signal: AbortSignal) => Promise<void>>();
let root: Root;
let visibility: 'visible' | 'hidden';
function Probe({ active = false }: { active?: boolean }) {
  useReaderJobPolling(refresh, active);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  refresh.mockReset().mockResolvedValue(undefined);
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('checks idle readers every 30 seconds instead of every 2 seconds', async () => {
  await act(async () => root.render(createElement(Probe)));
  await act(async () => vi.advanceTimersByTimeAsync(29_999));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(refresh).toHaveBeenCalledTimes(2);
});
it('pauses hidden pages and refreshes once when visibility and focus return together', async () => {
  await act(async () => root.render(createElement(Probe, { active: true })));
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(refresh).toHaveBeenCalledTimes(2);
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(refresh).toHaveBeenCalledTimes(2);
  visibility = 'visible';
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(refresh).toHaveBeenCalledTimes(3);
});
it('backs off errors and does not overlap slow requests', async () => {
  let release!: () => void;
  refresh.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
  await act(async () => root.render(createElement(Probe, { active: true })));
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  refresh.mockRejectedValueOnce(new Error('offline'));
  await act(async () => release());
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(9_999));
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(refresh).toHaveBeenCalledTimes(3);
});

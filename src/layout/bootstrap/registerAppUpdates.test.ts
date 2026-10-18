import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { registerAppUpdates } from './registerAppUpdates';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  activate: vi.fn(),
  confirm: vi.fn(),
  destroy: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('virtual:pwa-register', () => ({ registerSW: mocks.register }));
vi.mock('../../util/confirmDialog', () => ({ confirmDialog: mocks.confirm }));
vi.mock('@douyinfe/semi-ui', () => ({ Toast: { error: mocks.toast } }));

describe('PWA 手动更新', () => {
  let cleanup: () => void;
  let options: RegisterSWOptions;
  let reload: ReturnType<typeof vi.fn<() => void>>;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    mocks.activate.mockResolvedValue(undefined);
    mocks.confirm.mockReturnValue({ destroy: mocks.destroy });
    mocks.register.mockImplementation((value: RegisterSWOptions) => {
      options = value;
      return mocks.activate;
    });
    reload = vi.fn<() => void>();
    update = vi.fn().mockResolvedValue(undefined);
    cleanup = registerAppUpdates(reload);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function registered() {
    options.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration);
  }

  it('首次注册仅检查更新，不弹窗；更新就绪后等待用户确认才激活并刷新', async () => {
    registered();
    expect(update).toHaveBeenCalledOnce();
    expect(mocks.confirm).not.toHaveBeenCalled();
    options.onNeedRefresh?.();
    options.onNeedRefresh?.();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    await mocks.confirm.mock.calls[0][0].onOk();
    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith(true);
    expect(reload).not.toHaveBeenCalled();
    options.onNeedReload?.();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('稍后继续使用旧版，回到前台再次提示', () => {
    options.onNeedRefresh?.();
    mocks.confirm.mock.calls[0][0].onCancel();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.activate).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('focus'));
    expect(mocks.confirm).toHaveBeenCalledTimes(2);
  });

  it('后台发现更新时延后提示，恢复可见时提示', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    options.onNeedRefresh?.();
    expect(mocks.confirm).not.toHaveBeenCalled();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it('启动、前台恢复、定时和恢复联网均检查，连续前台事件合并', async () => {
    registered();
    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(270_000);
    expect(update).toHaveBeenCalledTimes(3);
    await Promise.resolve();
    window.dispatchEvent(new Event('online'));
    expect(update).toHaveBeenCalledTimes(4);
  });

  it('后台或离线不轮询，网络错误不产生未处理拒绝并可重试', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registered();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(update).toHaveBeenCalledOnce();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('focus'));
    expect(update).toHaveBeenCalledOnce();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    update.mockRejectedValueOnce(new Error('network'));
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(warn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('更新失败后保留弹窗并允许重试', async () => {
    options.onNeedRefresh?.();
    mocks.activate.mockRejectedValueOnce(new Error('activation failed'));
    const onOk = mocks.confirm.mock.calls[0][0].onOk;
    await expect(onOk()).rejects.toThrow('activation failed');
    expect(mocks.toast).toHaveBeenCalledOnce();
    expect(mocks.destroy).not.toHaveBeenCalled();
    await onOk();
    expect(mocks.activate).toHaveBeenCalledTimes(2);
  });

  it('手机返回键关闭更新弹窗，不激活新版本', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    options.onNeedRefresh?.();
    expect(push).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it('清理后移除前台监听、定时器和弹窗', async () => {
    registered();
    options.onNeedRefresh?.();
    cleanup();
    await vi.advanceTimersByTimeAsync(600_000);
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    expect(update).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});

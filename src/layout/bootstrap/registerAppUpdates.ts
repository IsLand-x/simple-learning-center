import { Toast } from '@douyinfe/semi-ui';
import { registerSW } from 'virtual:pwa-register';
import { confirmDialog } from '../../util/confirmDialog';

const UPDATE_INTERVAL = 5 * 60_000;
const HISTORY_KEY = 'learningCenterAppUpdate';

export function registerAppUpdates(reloadApplication: () => void) {
  let registration: ServiceWorkerRegistration | undefined;
  let updateReady = false;
  let checking = false;
  let updating = false;
  let disposed = false;
  let lastCheck = -Infinity;
  let dialog: ReturnType<typeof confirmDialog> | undefined;
  let historyId: string | undefined;

  function closePrompt(restoreHistory = true) {
    dialog?.destroy();
    dialog = undefined;
    const id = historyId;
    historyId = undefined;
    if (restoreHistory && id && window.history.state?.[HISTORY_KEY] === id) {
      window.history.back();
    }
  }

  function showPrompt() {
    if (disposed || !updateReady || dialog || updating || document.visibilityState === 'hidden')
      return;
    dialog = confirmDialog({
      title: '发现新版本',
      width: 'min(416px, calc(100vw - 32px))',
      closable: false,
      content: '新版本已准备好，更新后将刷新当前页面。请先保存正在编辑的内容。',
      okText: '立即更新',
      cancelText: '稍后',
      okButtonProps: { 'aria-label': '立即更新' },
      cancelButtonProps: { 'aria-label': '稍后' },
      onCancel: () => closePrompt(),
      onOk: async () => {
        if (updating) return;
        updating = true;
        try {
          await updateServiceWorker(true);
          closePrompt();
        } catch (error) {
          updating = false;
          Toast.error('更新失败，请稍后重试');
          throw error;
        }
      },
    });
    if (window.matchMedia('(max-width: 800px)').matches) {
      historyId = crypto.randomUUID();
      window.history.pushState(
        { ...window.history.state, [HISTORY_KEY]: historyId },
        '',
        window.location.href,
      );
    }
  }

  async function checkForUpdates() {
    if (disposed || document.visibilityState === 'hidden') return;
    showPrompt();
    if (!registration || checking || !navigator.onLine || Date.now() - lastCheck < 30_000) return;
    checking = true;
    lastCheck = Date.now();
    try {
      await registration.update();
    } catch (error) {
      // Offline and transient network errors must not interrupt reading.
      console.warn('PWA 更新检查失败', error);
    } finally {
      checking = false;
    }
  }

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedReload: reloadApplication,
    onNeedRefresh: () => {
      updateReady = true;
      showPrompt();
    },
    onRegisteredSW: (_url, registered) => {
      registration = registered;
      void checkForUpdates();
    },
    onRegisterError: (error) => console.warn('PWA 更新检查失败', error),
  });

  const onForeground = () => void checkForUpdates();
  const onOnline = () => {
    lastCheck = -Infinity;
    void checkForUpdates();
  };
  const onPopState = (event: PopStateEvent) => {
    if (historyId && event.state?.[HISTORY_KEY] !== historyId) closePrompt(false);
  };
  window.addEventListener('focus', onForeground);
  window.addEventListener('pageshow', onForeground);
  window.addEventListener('online', onOnline);
  window.addEventListener('popstate', onPopState);
  document.addEventListener('visibilitychange', onForeground);
  const interval = window.setInterval(onForeground, UPDATE_INTERVAL);

  return () => {
    disposed = true;
    closePrompt();
    window.clearInterval(interval);
    window.removeEventListener('focus', onForeground);
    window.removeEventListener('pageshow', onForeground);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('visibilitychange', onForeground);
  };
}

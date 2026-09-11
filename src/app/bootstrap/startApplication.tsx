import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from '../../App';
import { applyAppTheme, readInitialThemeMode } from '../../lib/appTheme';
import { getAuthSession } from '../../lib/auth';
import { synchronizeLearningState } from '../../lib/learningStateSync';
import { AUTHENTICATION_REQUIRED_EVENT } from '../../lib/serverApi';
import { prepareServerState } from '../../lib/serverStateStorage';
import { LoginPage } from '../../pages/LoginPage';
import { useLearningStore } from '../../store/useLearningStore';

const PRELOAD_RECOVERY_KEY = 'learning-center-preload-recovery';

export function startApplication(rootElement: HTMLElement) {
  applyAppTheme(readInitialThemeMode());
  const root = ReactDOM.createRoot(rootElement);
  let stateSyncRunning = false;
  let applicationReloadRequested = false;

  function reloadApplication() {
    if (applicationReloadRequested) return;
    applicationReloadRequested = true;
    window.location.reload();
  }

  function recoverOutdatedPreload() {
    const recoveryId = `${__APP_REVISION__}:${window.location.pathname}${window.location.search}`;
    try {
      if (window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) === recoveryId) return false;
      window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, recoveryId);
    } catch {
      // An in-memory guard still prevents duplicate reloads when storage is unavailable.
    }
    reloadApplication();
    return true;
  }

  window.addEventListener('vite:preloadError', (event) => {
    if (recoverOutdatedPreload()) event.preventDefault();
  });

  registerSW({
    immediate: true,
    onNeedReload: reloadApplication,
    onRegisterError: (error) => console.warn('PWA 更新检查失败', error),
  });

  async function synchronizeServerState() {
    if (stateSyncRunning || document.visibilityState === 'hidden') return;
    stateSyncRunning = true;
    try {
      await synchronizeLearningState();
    } catch (error) {
      console.warn('同步服务端学习数据失败', error);
    } finally {
      stateSyncRunning = false;
    }
  }

  function startServerStateSync() {
    window.addEventListener('focus', () => void synchronizeServerState());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void synchronizeServerState();
    });
    window.setInterval(() => void synchronizeServerState(), 30_000);
  }

  function showBootstrapMessage(message: string, error = false) {
    root.render(
      <main className="route-loading">
        <p>{message}</p>
        {error ? (
          <button type="button" onClick={() => window.location.reload()}>
            重新连接
          </button>
        ) : null}
      </main>,
    );
  }

  async function renderApplication() {
    try {
      const session = await getAuthSession();
      if (!session.authenticated) {
        root.render(
          <React.StrictMode>
            <LoginPage onAuthenticated={() => window.location.reload()} />
          </React.StrictMode>,
        );
        return;
      }
      await prepareServerState((message) => showBootstrapMessage(message));
      await useLearningStore.persist.rehydrate();
      useLearningStore.setState({});
      root.render(
        <React.StrictMode>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </React.StrictMode>,
      );
      startServerStateSync();
    } catch (error) {
      console.error('学习中心启动失败', error);
      const message = error instanceof Error ? error.message : '学习中心启动失败';
      showBootstrapMessage(message, true);
    }
  }

  window.addEventListener(AUTHENTICATION_REQUIRED_EVENT, () => {
    root.render(
      <React.StrictMode>
        <LoginPage onAuthenticated={() => window.location.reload()} />
      </React.StrictMode>,
    );
  });

  void renderApplication();
}

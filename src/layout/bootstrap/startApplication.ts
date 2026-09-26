import { createElement, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { authApi } from '../../api/auth';
import { AUTHENTICATION_REQUIRED_EVENT } from '../../api/http/errors';
import { applyAppTheme, readInitialThemeMode } from '../../util/appTheme';
import { ApplicationRoot } from './ApplicationRoot';
import { BootstrapMessage } from './BootstrapMessage';

import { synchronizeLearningState } from '../../store/learningStateSync';

import { prepareServerState } from '../../store/serverStateStorage';
import { useLearningStore } from '../../store/useLearningStore';
import { LoginPage } from '../login/index';

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
    root.render(createElement(BootstrapMessage, { message, error }));
  }

  async function renderApplication() {
    try {
      const session = await authApi.getSession();
      if (!session.authenticated) {
        showLogin();
        return;
      }
      await prepareServerState((message) => showBootstrapMessage(message));
      await useLearningStore.persist.rehydrate();
      useLearningStore.setState({});
      root.render(createElement(StrictMode, null, createElement(ApplicationRoot)));
      startServerStateSync();
    } catch (error) {
      console.error('学习中心启动失败', error);
      const message = error instanceof Error ? error.message : '学习中心启动失败';
      showBootstrapMessage(message, true);
    }
  }

  function showLogin() {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(LoginPage, { onAuthenticated: () => window.location.reload() }),
      ),
    );
  }
  window.addEventListener(AUTHENTICATION_REQUIRED_EVENT, showLogin);

  void renderApplication();
}

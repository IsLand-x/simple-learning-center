import { useEffect, useState } from 'react';
import { Button, Nav, Toast, Tooltip } from '@douyinfe/semi-ui';
import { IconBook, IconChevronLeft, IconChevronRight, IconDownload, IconMoon, IconSettingStroked, IconSun } from '@douyinfe/semi-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLearningStore } from '../store/useLearningStore';
import { detectPwaInstallation, isRunningAsInstalledPwa, watchInstalledDisplayMode } from '../lib/pwaInstall';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const navCollapsed = useLearningStore((state) => state.navCollapsed);
  const setNavCollapsed = useLearningStore((state) => state.setNavCollapsed);
  const themeMode = useLearningStore((state) => state.themeMode);
  const setThemeMode = useLearningStore((state) => state.setThemeMode);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaWindow, setIsPwaWindow] = useState(isRunningAsInstalledPwa);
  const [installationStatus, setInstallationStatus] = useState<'checking' | 'installed' | 'not-installed'>(() => (
    isRunningAsInstalledPwa() ? 'installed' : 'checking'
  ));

  useEffect(() => {
    document.body.setAttribute('theme-mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    let active = true;
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallationStatus('not-installed');
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallationStatus('installed');
    };
    const handleDisplayModeChange = () => {
      const nextIsPwaWindow = isRunningAsInstalledPwa();
      setIsPwaWindow(nextIsPwaWindow);
      if (nextIsPwaWindow) {
        setInstallPrompt(null);
        setInstallationStatus('installed');
      }
    };

    void detectPwaInstallation().then((status) => {
      if (!active) return;
      setInstallationStatus(status === 'installed' ? 'installed' : 'not-installed');
    });

    const stopWatchingDisplayMode = watchInstalledDisplayMode(handleDisplayModeChange);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      active = false;
      stopWatchingDisplayMode();
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const installButton = !isPwaWindow && installationStatus === 'not-installed' ? (
    <Tooltip content="安装并打开应用" position="right">
      <Button
        aria-label="安装并打开学习中心"
        icon={<IconDownload />}
        size="default"
        type="tertiary"
        theme="borderless"
        className="nav-footer-icon-button pwa-install-button"
        onClick={async () => {
          if (installPrompt) {
            setInstallPrompt(null);
            try {
              await installPrompt.prompt();
              const choice = await installPrompt.userChoice;
              if (choice.outcome === 'accepted') {
                setInstallationStatus('installed');
              }
            } catch {
              Toast.error('未能打开安装窗口，请使用浏览器菜单安装应用');
            }
          } else {
            Toast.info('请使用 Chrome、Edge 或 Safari 的“安装应用 / 添加到主屏幕”功能');
          }
        }}
      />
    </Tooltip>
  ) : null;

  const themeButton = (
    <Tooltip content={themeMode === 'light' ? '切换为深色主题' : '切换为浅色主题'} position="right">
      <Button
        aria-label={themeMode === 'light' ? '切换为深色主题' : '切换为浅色主题'}
        icon={themeMode === 'light' ? <IconMoon /> : <IconSun />}
        size="default"
        type="tertiary"
        theme="borderless"
        className="nav-footer-icon-button"
        onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
      />
    </Tooltip>
  );

  const collapseButton = (
    <Tooltip content={navCollapsed ? '展开功能栏' : '收起功能栏'} position="right">
      <Button
        aria-label={navCollapsed ? '展开功能栏' : '收起功能栏'}
        icon={navCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        size="default"
        type="tertiary"
        theme="borderless"
        className="nav-footer-icon-button"
        onClick={() => setNavCollapsed(!navCollapsed)}
      />
    </Tooltip>
  );

  return (
    <Nav
      className="main-nav"
      isCollapsed={navCollapsed}
      onCollapseChange={setNavCollapsed}
      selectedKeys={location.pathname === '/settings' ? ['settings'] : ['books']}
      onClick={({ itemKey }) => navigate(itemKey === 'settings' ? '/settings' : '/')}
      items={[
        {
          itemKey: 'books',
          text: '读书',
          icon: <IconBook />,
          onClick: () => navigate('/'),
        },
        {
          itemKey: 'settings',
          text: '设置',
          icon: <IconSettingStroked />,
          onClick: () => navigate('/settings'),
        },
      ]}
      footer={{
        collapseButton: false,
        children: (
          <div className="nav-footer-actions">
            {installButton}
            {themeButton}
            {collapseButton}
          </div>
        ),
      }}
    />
  );
}

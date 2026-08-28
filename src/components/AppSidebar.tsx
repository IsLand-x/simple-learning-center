import { useEffect, useState } from 'react';
import { Button, Nav, Toast, Tooltip } from '@douyinfe/semi-ui';
import { IconBook, IconChevronLeft, IconChevronRight, IconDownload, IconMoon, IconSettingStroked, IconSun } from '@douyinfe/semi-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLearningStore } from '../store/useLearningStore';

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
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);

  useEffect(() => {
    document.body.setAttribute('theme-mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const installButton = !installed ? (
    <Tooltip content="安装到此设备" position="right">
      <Button
        aria-label="安装学习中心到此设备"
        icon={<IconDownload />}
        size="default"
        type="tertiary"
        theme="borderless"
        className="nav-footer-icon-button"
        onClick={async () => {
          if (installPrompt) {
            await installPrompt.prompt();
            await installPrompt.userChoice;
            setInstallPrompt(null);
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

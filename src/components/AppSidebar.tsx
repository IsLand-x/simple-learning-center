import { useEffect } from 'react';
import { Button, Nav, Tooltip } from '@douyinfe/semi-ui';
import { IconBook, IconChevronLeft, IconChevronRight, IconMoon, IconSun } from '@douyinfe/semi-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLearningStore } from '../store/useLearningStore';

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const navCollapsed = useLearningStore((state) => state.navCollapsed);
  const setNavCollapsed = useLearningStore((state) => state.setNavCollapsed);
  const themeMode = useLearningStore((state) => state.themeMode);
  const setThemeMode = useLearningStore((state) => state.setThemeMode);

  useEffect(() => {
    document.body.setAttribute('theme-mode', themeMode);
  }, [themeMode]);

  const themeButton = (
    <Button
      aria-label={themeMode === 'light' ? '切换为深色主题' : '切换为浅色主题'}
      icon={themeMode === 'light' ? <IconMoon /> : <IconSun />}
      theme="borderless"
      className="theme-button"
      onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
    >
      {!navCollapsed && (themeMode === 'light' ? '深色' : '浅色')}
    </Button>
  );

  const collapseButton = (
    <Tooltip content={navCollapsed ? '展开功能栏' : '收起功能栏'} position="right">
      <Button
        aria-label={navCollapsed ? '展开功能栏' : '收起功能栏'}
        icon={navCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        theme="borderless"
        className="nav-collapse-button"
        onClick={() => setNavCollapsed(!navCollapsed)}
      />
    </Tooltip>
  );

  return (
    <Nav
      className="main-nav"
      isCollapsed={navCollapsed}
      onCollapseChange={setNavCollapsed}
      selectedKeys={location.pathname.startsWith('/books') || location.pathname === '/' ? ['books'] : []}
      onClick={({ itemKey }) => itemKey === 'books' && navigate('/')}
      items={[{
        itemKey: 'books',
        text: '读书',
        icon: <IconBook />,
        onClick: () => navigate('/'),
      }]}
      footer={{
        collapseButton: false,
        children: (
          <div className="nav-footer-actions">
            {navCollapsed
              ? <Tooltip content={themeMode === 'light' ? '切换为深色主题' : '切换为浅色主题'} position="right">{themeButton}</Tooltip>
              : themeButton}
            {collapseButton}
          </div>
        ),
      }}
    />
  );
}

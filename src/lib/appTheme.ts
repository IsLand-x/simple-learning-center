import type { ThemeMode } from '../types';

const SESSION_THEME_KEY = 'learning-center-theme-mode';

export function readInitialThemeMode(): ThemeMode {
  try {
    const sessionTheme = window.sessionStorage.getItem(SESSION_THEME_KEY);
    if (sessionTheme === 'light' || sessionTheme === 'dark') return sessionTheme;
  } catch {
    // 浏览器禁用存储时仍可根据系统偏好初始化主题。
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyAppTheme(themeMode: ThemeMode) {
  document.body.setAttribute('theme-mode', themeMode);
  document.documentElement.style.colorScheme = themeMode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    themeMode === 'dark' ? '#16161a' : '#ffffff',
  );
  try {
    window.sessionStorage.setItem(SESSION_THEME_KEY, themeMode);
  } catch {
    // 主题仍已应用到当前页面，无需阻断渲染。
  }
}

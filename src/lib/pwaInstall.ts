export type PwaInstallationStatus = 'installed' | 'not-installed' | 'unsupported';

interface InstalledRelatedApplication {
  id?: string;
  platform?: string;
  url?: string;
}

interface NavigatorWithPwaSupport extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<InstalledRelatedApplication[]>;
}

const installedDisplayModes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'] as const;

function getDisplayModeQueries() {
  return installedDisplayModes.map((mode) => window.matchMedia(`(display-mode: ${mode})`));
}

export function isRunningAsInstalledPwa() {
  const pwaNavigator = navigator as NavigatorWithPwaSupport;
  return pwaNavigator.standalone === true
    || document.referrer.startsWith('android-app://')
    || getDisplayModeQueries().some((query) => query.matches);
}

export function watchInstalledDisplayMode(onChange: () => void) {
  const queries = getDisplayModeQueries();
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
}

export async function detectPwaInstallation(): Promise<PwaInstallationStatus> {
  if (isRunningAsInstalledPwa()) return 'installed';

  const pwaNavigator = navigator as NavigatorWithPwaSupport;
  if (!pwaNavigator.getInstalledRelatedApps) return 'unsupported';

  try {
    const relatedApps = await pwaNavigator.getInstalledRelatedApps();
    return relatedApps.some((app) => app.platform === 'webapp') ? 'installed' : 'not-installed';
  } catch {
    return 'unsupported';
  }
}

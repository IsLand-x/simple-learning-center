import { ArticleOverlays } from './components/ArticlePanel/ArticleOverlays';
import { DesktopWorkspace } from './components/DesktopWorkspace';
import { DigestSettings } from './components/DigestPanel/DigestSettings';
import { ItemMenu } from './components/ItemsPanel/ItemMenu';
import { MobileWorkspace } from './components/MobileWorkspace/MobileWorkspace';
import { SourceDialogs } from './components/SourcesPanel/SourceDialogs';
import { WorkspaceContext } from './store/WorkspaceContext';
import { useWorkspaceState } from './store/useWorkspaceState';
export function RssPage() {
  const workspace = useWorkspaceState();
  return (
    <WorkspaceContext.Provider value={workspace}>
      <main className="rss-page w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)] mobile:[padding-bottom:0]">
        {workspace.navigation.mobileLayout ? <MobileWorkspace /> : <DesktopWorkspace />}
        <SourceDialogs />
        <DigestSettings />
        <ArticleOverlays />
        <ItemMenu />
      </main>
    </WorkspaceContext.Provider>
  );
}

import { AppSidebar } from './components/AppSidebar';
import { AppRoutes } from './AppRoutes';

export function App() {
  return (
    <div className="app-shell w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]">
      <AppSidebar />
      <div className="app-workspace min-w-0 min-h-0 overflow-hidden mobile:[order:1]">
        <AppRoutes />
      </div>
    </div>
  );
}

import { AppSidebar } from './components/AppSidebar';
import { AppRoutes } from './app/AppRoutes';

export function App() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-workspace">
        <AppRoutes />
      </div>
    </div>
  );
}

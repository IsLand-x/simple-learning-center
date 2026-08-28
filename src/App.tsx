import { lazy, Suspense } from 'react';
import { Spin } from '@douyinfe/semi-ui';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppSidebar } from './components/AppSidebar';
import { ReaderErrorBoundary } from './components/ReaderErrorBoundary';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';

const ReaderPage = lazy(() => import('./pages/ReaderPage').then((module) => ({ default: module.ReaderPage })));

export function App() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-workspace">
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/books/:bookId"
            element={(
              <ReaderErrorBoundary>
                <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>
                  <ReaderPage />
                </Suspense>
              </ReaderErrorBoundary>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

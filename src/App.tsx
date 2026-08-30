import { lazy, Suspense } from 'react';
import { Spin } from '@douyinfe/semi-ui';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppSidebar } from './components/AppSidebar';
import { ReaderErrorBoundary } from './components/ReaderErrorBoundary';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';

const ReaderPage = lazy(() => import('./pages/ReaderPage').then((module) => ({ default: module.ReaderPage })));
const RssPage = lazy(() => import('./pages/RssPage').then((module) => ({ default: module.RssPage })));
const VideoStudyPage = lazy(() => import('./pages/VideoStudyPage').then((module) => ({ default: module.VideoStudyPage })));

export function App() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-workspace">
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/rss"
            element={(
              <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>
                <RssPage />
              </Suspense>
            )}
          />
          <Route
            path="/videos"
            element={(
              <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>
                <VideoStudyPage />
              </Suspense>
            )}
          />
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

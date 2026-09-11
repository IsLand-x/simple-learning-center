import { lazy, Suspense, type ReactNode } from 'react';
import { Spin } from '@douyinfe/semi-ui';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppSidebar } from './components/AppSidebar';
import { ReaderErrorBoundary } from './components/ReaderErrorBoundary';
import { ServerStateBoundary } from './components/ServerStateBoundary';

const LibraryPage = lazy(() => import('./pages/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const ReaderPage = lazy(() => import('./pages/ReaderPage').then((module) => ({ default: module.ReaderPage })));
const RssPage = lazy(() => import('./pages/RssPage').then((module) => ({ default: module.RssPage })));
const VideoStudyPage = lazy(() => import('./pages/VideoStudyPage').then((module) => ({ default: module.VideoStudyPage })));

function LoadingRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>{children}</Suspense>;
}

function ReaderRoute() {
  const { bookId = '' } = useParams();
  return (
    <ReaderErrorBoundary>
      <ServerStateBoundary context={{ scope: 'reader', bookId }}>
        <ReaderPage />
      </ServerStateBoundary>
    </ReaderErrorBoundary>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-workspace">
        <Routes>
          <Route path="/" element={<LoadingRoute><ServerStateBoundary context={{ scope: 'library' }}><LibraryPage /></ServerStateBoundary></LoadingRoute>} />
          <Route path="/settings" element={<LoadingRoute><ServerStateBoundary context={{ scope: 'settings' }}><SettingsPage /></ServerStateBoundary></LoadingRoute>} />
          <Route
            path="/rss"
            element={(
              <LoadingRoute><ServerStateBoundary context={{ scope: 'rss' }}><RssPage /></ServerStateBoundary></LoadingRoute>
            )}
          />
          <Route
            path="/videos"
            element={(
              <LoadingRoute><ServerStateBoundary context={{ scope: 'videos' }}><VideoStudyPage /></ServerStateBoundary></LoadingRoute>
            )}
          />
          <Route
            path="/books/:bookId"
            element={(
              <LoadingRoute><ReaderRoute /></LoadingRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

import { lazy, Suspense, type ReactNode } from 'react';
import { Spin } from '@douyinfe/semi-ui';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppSidebar } from './components/AppSidebar';
import { ReaderErrorBoundary } from './components/ReaderErrorBoundary';
import { StateDomainGate } from './components/StateDomainGate';
import {
  LIBRARY_STATE_DOMAINS,
  READER_STATE_DOMAINS,
  RSS_STATE_DOMAINS,
  SETTINGS_STATE_DOMAINS,
  VIDEO_STATE_DOMAINS,
} from './lib/stateDomains';

const LibraryPage = lazy(() => import('./pages/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const ReaderPage = lazy(() => import('./pages/ReaderPage').then((module) => ({ default: module.ReaderPage })));
const RssPage = lazy(() => import('./pages/RssPage').then((module) => ({ default: module.RssPage })));
const VideoStudyPage = lazy(() => import('./pages/VideoStudyPage').then((module) => ({ default: module.VideoStudyPage })));

function LoadingRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>{children}</Suspense>;
}

export function App() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-workspace">
        <Routes>
          <Route
            path="/"
            element={<LoadingRoute><StateDomainGate domains={LIBRARY_STATE_DOMAINS}><LibraryPage /></StateDomainGate></LoadingRoute>}
          />
          <Route
            path="/settings"
            element={<LoadingRoute><StateDomainGate domains={SETTINGS_STATE_DOMAINS}><SettingsPage /></StateDomainGate></LoadingRoute>}
          />
          <Route
            path="/rss"
            element={(
              <LoadingRoute><StateDomainGate domains={RSS_STATE_DOMAINS}><RssPage /></StateDomainGate></LoadingRoute>
            )}
          />
          <Route
            path="/videos"
            element={(
              <LoadingRoute><StateDomainGate domains={VIDEO_STATE_DOMAINS}><VideoStudyPage /></StateDomainGate></LoadingRoute>
            )}
          />
          <Route
            path="/books/:bookId"
            element={(
              <LoadingRoute>
                <StateDomainGate domains={READER_STATE_DOMAINS}>
                  <ReaderErrorBoundary><ReaderPage /></ReaderErrorBoundary>
                </StateDomainGate>
              </LoadingRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

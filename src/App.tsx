import { lazy, Suspense } from 'react';
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
          <Route
            path="/"
            element={<StateDomainGate domains={LIBRARY_STATE_DOMAINS}><LibraryPage /></StateDomainGate>}
          />
          <Route
            path="/settings"
            element={<StateDomainGate domains={SETTINGS_STATE_DOMAINS}><SettingsPage /></StateDomainGate>}
          />
          <Route
            path="/rss"
            element={(
              <StateDomainGate domains={RSS_STATE_DOMAINS}>
                <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>
                  <RssPage />
                </Suspense>
              </StateDomainGate>
            )}
          />
          <Route
            path="/videos"
            element={(
              <StateDomainGate domains={VIDEO_STATE_DOMAINS}>
                <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>
                  <VideoStudyPage />
                </Suspense>
              </StateDomainGate>
            )}
          />
          <Route
            path="/books/:bookId"
            element={(
              <StateDomainGate domains={READER_STATE_DOMAINS}>
                <ReaderErrorBoundary>
                  <Suspense fallback={<div className="route-loading"><Spin size="large" /></div>}>
                    <ReaderPage />
                  </Suspense>
                </ReaderErrorBoundary>
              </StateDomainGate>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

import { lazy, Suspense, type ReactNode } from 'react';
import { Spin } from '@douyinfe/semi-ui';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ReaderErrorBoundary } from '../components/ReaderErrorBoundary';
import { StateDomainGate } from '../components/StateDomainGate';
import {
  LIBRARY_STATE_DOMAINS,
  READER_STATE_DOMAINS,
  RSS_STATE_DOMAINS,
  SETTINGS_STATE_DOMAINS,
  VIDEO_STATE_DOMAINS,
  type StateDomain,
} from '../lib/stateDomains';

const LibraryPage = lazy(() =>
  import('../pages/LibraryPage').then((module) => ({ default: module.LibraryPage })),
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const ReaderPage = lazy(() =>
  import('../pages/ReaderPage').then((module) => ({ default: module.ReaderPage })),
);
const RssPage = lazy(() =>
  import('../pages/RssPage').then((module) => ({ default: module.RssPage })),
);
const VideoStudyPage = lazy(() =>
  import('../pages/VideoStudyPage').then((module) => ({ default: module.VideoStudyPage })),
);

function LoadingRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="route-loading">
          <Spin size="large" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function DomainRoute({
  children,
  domains,
}: {
  children: ReactNode;
  domains: readonly StateDomain[];
}) {
  return (
    <LoadingRoute>
      <StateDomainGate domains={domains}>{children}</StateDomainGate>
    </LoadingRoute>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <DomainRoute domains={LIBRARY_STATE_DOMAINS}>
            <LibraryPage />
          </DomainRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <DomainRoute domains={SETTINGS_STATE_DOMAINS}>
            <SettingsPage />
          </DomainRoute>
        }
      />
      <Route
        path="/rss"
        element={
          <DomainRoute domains={RSS_STATE_DOMAINS}>
            <RssPage />
          </DomainRoute>
        }
      />
      <Route
        path="/videos"
        element={
          <DomainRoute domains={VIDEO_STATE_DOMAINS}>
            <VideoStudyPage />
          </DomainRoute>
        }
      />
      <Route
        path="/books/:bookId"
        element={
          <DomainRoute domains={READER_STATE_DOMAINS}>
            <ReaderErrorBoundary>
              <ReaderPage />
            </ReaderErrorBoundary>
          </DomainRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

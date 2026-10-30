import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ReaderErrorBoundary } from '../pages/books/detail/components/ReaderSurface/ReaderErrorBoundary';
import {
  LIBRARY_STATE_DOMAINS,
  READER_STATE_DOMAINS,
  SETTINGS_STATE_DOMAINS,
} from '../store/stateDomains';
import { DomainRoute } from './components/DomainRoute';

const LibraryPage = lazy(() =>
  import('../pages/books/list/index').then((module) => ({ default: module.LibraryPage })),
);
const SettingsPage = lazy(() =>
  import('../pages/settings/index').then((module) => ({ default: module.SettingsPage })),
);
const ReaderPage = lazy(() =>
  import('../pages/books/detail/index').then((module) => ({ default: module.ReaderPage })),
);

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

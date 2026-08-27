import { Navigate, Route, Routes } from 'react-router-dom';
import { AppSidebar } from './components/AppSidebar';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';

export function App() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-workspace">
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/books/:bookId" element={<ReaderPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

import { useParams } from 'react-router-dom';
import { ReaderAiActivityProvider } from './components/AssistantPanel/ReaderAiActivityProvider';
import { ReaderPageContent } from './ReaderPageContent';

export function ReaderPage() {
  const { bookId = '' } = useParams();
  return (
    <ReaderAiActivityProvider key={bookId} bookId={bookId}>
      <ReaderPageContent />
    </ReaderAiActivityProvider>
  );
}

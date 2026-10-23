import { createContext, useContext } from 'react';
import type { AiJobSummary } from '../../../../../api/ai/type';

import type { ReaderAiActivity } from './activity';

export const ReaderAiActivityContext = createContext<{
  status: ReaderAiActivity;
  conversationId?: string;
}>({ status: 'idle' });

// Progress belongs to the panels; reader navigation and activity icons only need status.
export const ReaderAiJobsContext = createContext<{
  jobs: AiJobSummary[];
  startingConversations: string[];
  setStarting: (conversationId: string, starting: boolean) => void;
  reportJob: (job: AiJobSummary) => void;
}>({
  jobs: [],
  startingConversations: [],
  setStarting: () => undefined,
  reportJob: () => undefined,
});

export function useReaderAiActivity() {
  return useContext(ReaderAiActivityContext);
}

export function useReaderAiJobs() {
  return useContext(ReaderAiJobsContext);
}

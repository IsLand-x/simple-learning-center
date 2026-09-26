import { createContext, useContext } from 'react';
import type { AiJob } from '../../../../../util/ai/aiJobs';
import type { ReaderAiActivity } from '../model/readerAiActivity';

export const ReaderAiActivityContext = createContext<{
  jobs: AiJob[];
  startingConversations: string[];
  setStarting: (conversationId: string, starting: boolean) => void;
  status: ReaderAiActivity;
  conversationId?: string;
  reportJob: (job: AiJob) => void;
}>({
  status: 'idle',
  jobs: [],
  startingConversations: [],
  setStarting: () => undefined,
  reportJob: () => undefined,
});

export function useReaderAiActivity() {
  return useContext(ReaderAiActivityContext);
}

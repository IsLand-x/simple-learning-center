import { createContext, useContext } from 'react';
import type { AiJob } from '../../../../../api/ai/type';

import type { ReaderAiActivity } from './activity';

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

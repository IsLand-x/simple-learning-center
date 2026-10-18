import { createContext, useContext } from 'react';
import type { AiJobSummary } from '../../../../../api/ai/type';

import type { ReaderAiActivity } from './activity';

export const ReaderAiActivityContext = createContext<{
  jobs: AiJobSummary[];
  startingConversations: string[];
  setStarting: (conversationId: string, starting: boolean) => void;
  status: ReaderAiActivity;
  conversationId?: string;
  reportJob: (job: AiJobSummary) => void;
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

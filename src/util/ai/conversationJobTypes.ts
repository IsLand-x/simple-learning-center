import type { Dispatch, SetStateAction } from 'react';
import type { AiDialogueContentItem } from '../../types/domain';

type ConversationStatus = 'unavailable' | 'ready' | 'generating' | 'error';

interface StreamingAssistantMessage {
  id: string;
  role: 'assistant';
  content: string | AiDialogueContentItem[];
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
}

export interface ConversationJobControls {
  activeJobId: string | null;
  setActiveJobId: Dispatch<SetStateAction<string | null>>;
  setStreamingAssistant: Dispatch<SetStateAction<StreamingAssistantMessage | null>>;
  setStatus: Dispatch<SetStateAction<ConversationStatus>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
}

import { useLearningStore } from '../../store/useLearningStore';

// The input owns its editor state; remount it when this draft key changes.
export function useConversationDraft(resourceId: string, conversationId: string) {
  const text = useLearningStore(
    (state) =>
      state.conversationDrafts.find(
        (draft) => draft.resourceId === resourceId && draft.conversationId === conversationId,
      )?.text ?? '',
  );
  const save = useLearningStore((state) => state.setConversationDraft);
  return {
    key: JSON.stringify([resourceId, conversationId]),
    defaultContent: {
      type: 'doc',
      content: text.split('\n').map((line) => ({
        type: 'paragraph',
        ...(line ? { content: [{ type: 'text', text: line }] } : {}),
      })),
    },
    onContentChange: (contents: Array<{ type: string; text?: unknown }>) => {
      save(
        resourceId,
        conversationId,
        contents
          .map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : ''))
          .join(''),
      );
    },
  };
}

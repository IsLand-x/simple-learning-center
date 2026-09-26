import { AIChatDialogue, Empty } from '@douyinfe/semi-ui';
import { useEffect, useLayoutEffect, useRef, type ComponentProps, type ComponentType } from 'react';
import { CspSafeChatContent } from './CspSafeChatContent';

type DialogueChats = NonNullable<ComponentProps<typeof AIChatDialogue>['chats']>;
type DialogueQuote = { text: string; chapter: string };
type DialogueChat = DialogueChats[number] & { quote?: DialogueQuote };

export function AiConversationDialogue({
  chats,
  assistantName,
  emptyTitle,
  emptyDescription,
  autoHideReasoning = false,
  ImageComponent,
}: {
  chats: DialogueChat[];
  assistantName: string;
  emptyTitle: string;
  emptyDescription: string;
  autoHideReasoning?: boolean;
  ImageComponent?: ComponentType<{ src?: string; alt?: string }>;
}) {
  const dialogueRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const hasChats = chats.length > 0;

  useEffect(() => {
    const list = dialogueRef.current?.querySelector<HTMLElement>('.semi-ai-chat-dialogue-list');
    if (!list) return;
    const updateFollowLatest = () => {
      followLatestRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 32;
    };
    list.addEventListener('scroll', updateFollowLatest, { passive: true });
    return () => list.removeEventListener('scroll', updateFollowLatest);
  }, [hasChats]);

  useLayoutEffect(() => {
    const list = dialogueRef.current?.querySelector<HTMLElement>('.semi-ai-chat-dialogue-list');
    if (!list) return;
    const lastMessageId = chats.at(-1)?.id;
    if (lastMessageId !== lastMessageIdRef.current) {
      followLatestRef.current = true;
      lastMessageIdRef.current = lastMessageId;
    }
    if (followLatestRef.current) list.scrollTop = list.scrollHeight;
  }, [chats]);

  if (!chats.length) return <Empty title={emptyTitle} description={emptyDescription} />;
  const quoteByMessageId = new Map(
    chats.flatMap((message) =>
      message.quote ? [[String(message.id), message.quote] as const] : [],
    ),
  );
  const statusByMessageId = new Map(chats.map((message) => [message.id, message.status]));
  return (
    <div ref={dialogueRef} className="ai-dialogue-scroll-host min-h-0">
      <AIChatDialogue
        // Semi scrolls every in-progress update to the bottom, including after touch scrolling.
        // Keep the real status for our content renderer and control following via the list position.
        chats={chats.map((message) => ({ ...message, status: 'completed' as const }))}
        align="leftAlign"
        mode="bubble"
        roleConfig={{ user: { name: '你' }, assistant: { name: assistantName } }}
        dialogueRenderConfig={{
          renderDialogueAvatar: () => null,
          renderDialogueTitle: () => null,
          renderDialogueAction: () => null,
          renderDialogueContent: ({ message, className }) => (
            <CspSafeChatContent
              message={
                message ? { ...message, status: statusByMessageId.get(message.id) } : message
              }
              bubbleClassName={`${className} ai-message--${message?.role ?? 'assistant'}`}
              quote={message ? quoteByMessageId.get(String(message.id)) : undefined}
              autoHideReasoning={autoHideReasoning}
              ImageComponent={message?.role === 'assistant' ? ImageComponent : undefined}
            />
          ),
        }}
      />
    </div>
  );
}

import { useEffect, useId, useLayoutEffect, useRef, type ComponentProps } from 'react';
import { AIChatDialogue, Cascader, Empty, Select, Tooltip } from '@douyinfe/semi-ui';
import { coerceAiReasoningEffort, getAiReasoningProfile } from '../lib/aiReasoning';
import type { AiProvider, AiReasoningEffort, OpenAICompatibleConfig } from '../types';
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
}: {
  chats: DialogueChat[];
  assistantName: string;
  emptyTitle: string;
  emptyDescription: string;
  autoHideReasoning?: boolean;
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
    <div ref={dialogueRef} className="ai-dialogue-scroll-host">
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
            />
          ),
        }}
      />
    </div>
  );
}

export function AiModelSelector({
  configs,
  provider,
  model,
  disabled,
  className,
  onChange,
}: {
  configs: OpenAICompatibleConfig[];
  provider: AiProvider | null;
  model: string;
  disabled: boolean;
  className?: string;
  onChange: (selection: unknown) => void;
}) {
  const treeData = configs.map((config) => ({
    label: config.name,
    value: `api:${config.id}`,
    children: config.models.map((item) => ({ label: item, value: item })),
  }));
  return (
    <Cascader
      aria-label="选择 AI 供应商和模型"
      size="small"
      treeData={treeData}
      value={provider && model ? [provider, model] : []}
      placeholder="选择供应商 / 模型"
      disabled={disabled}
      showNext="hover"
      changeOnSelect={false}
      displayRender={(labels) => (Array.isArray(labels) ? (labels.at(-1) ?? '') : '')}
      onChange={onChange}
      className={`ai-composer-model-cascader${className ? ` ${className}` : ''}`}
    />
  );
}

export function AiReasoningEffortSelector({
  config,
  model,
  value,
  disabled,
  onChange,
}: {
  config?: OpenAICompatibleConfig;
  model: string;
  value: AiReasoningEffort;
  disabled: boolean;
  onChange: (effort: AiReasoningEffort) => void;
}) {
  const profile = getAiReasoningProfile(config, model);
  const effectiveValue = coerceAiReasoningEffort(value, config, model);
  const selectedLabel =
    profile.options.find((option) => option.value === effectiveValue)?.label ?? '自动';
  const labelId = useId();
  return (
    <Tooltip content={profile.description} position="top">
      <span className="ai-composer-reasoning-control">
        <span className="visually-hidden" id={labelId}>
          选择 AI 强度
        </span>
        <Select
          aria-labelledby={labelId}
          className="ai-composer-reasoning-select"
          disabled={disabled || profile.kind === 'unsupported'}
          renderSelectedItem={() => `强度 · ${selectedLabel}`}
          showArrow={false}
          size="small"
          value={effectiveValue}
          onChange={(nextValue) => onChange(nextValue as AiReasoningEffort)}
        >
          {profile.options.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      </span>
    </Tooltip>
  );
}

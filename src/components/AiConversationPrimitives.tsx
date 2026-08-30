import type { ComponentProps } from 'react';
import { AIChatDialogue, Cascader, Empty } from '@douyinfe/semi-ui';
import type { AiProvider, OpenAICompatibleConfig } from '../types';
import { CspSafeChatContent } from './CspSafeChatContent';

type DialogueChats = NonNullable<ComponentProps<typeof AIChatDialogue>['chats']>;

export function AiConversationDialogue({
  chats,
  assistantName,
  emptyTitle,
  emptyDescription,
}: {
  chats: DialogueChats;
  assistantName: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!chats.length) return <Empty title={emptyTitle} description={emptyDescription} />;
  return (
    <AIChatDialogue
      chats={chats}
      align="leftRight"
      mode="bubble"
      roleConfig={{ user: { name: '你' }, assistant: { name: assistantName } }}
      dialogueRenderConfig={{
        renderDialogueAvatar: () => null,
        renderDialogueTitle: () => null,
        renderDialogueAction: () => null,
        renderDialogueContent: ({ message, className }) => (
          <CspSafeChatContent message={message} bubbleClassName={className} />
        ),
      }}
    />
  );
}

export function AiModelSelector({
  configs,
  provider,
  model,
  disabled,
  onChange,
}: {
  configs: OpenAICompatibleConfig[];
  provider: AiProvider | null;
  model: string;
  disabled: boolean;
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
      displayRender={(labels) => Array.isArray(labels) ? labels.at(-1) ?? '' : ''}
      onChange={onChange}
      className="ai-composer-model-cascader"
    />
  );
}

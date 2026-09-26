import { useReaderConversation } from '../../store/useReaderConversation';
import { BookResourceImage } from './BookResourcesPanel';
import { AIChatInput, Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconBookOpenStroked } from '@douyinfe/semi-icons';
import type { BookItem, ChatMessage } from '../../../../../util/types';
import {
  AiConversationDialogue,
  AiModelSelector,
  AiReasoningEffortSelector,
} from '../../../../../components/ai/AiConversationPrimitives';
import { extractInputText, providerLabel } from '../../store/model/rightPanelModel';

const { Text } = Typography;

export function AiConversationPanel({
  book,
  conversationId,
  selectedQuote,
  getCurrentText,
  onClearSelectedText,
}: {
  book: BookItem;
  conversationId: string;
  selectedQuote?: NonNullable<ChatMessage['quote']>;
  getCurrentText: () => string;
  onClearSelectedText: () => void;
}) {
  const {
    chatAreaRef,
    userTurns,
    jumpToUserTurn,
    dialogueMessages,
    provider,
    configs,
    aiPreferences,
    inputRef,
    quote,
    setQuote,
    canSend,
    status,
    send,
    stop,
    visiblePromptTemplates,
    selectedConfig,
    statusMessage,
    model,
    reasoningEffort,
    chooseModel,
    chooseReasoningEffort,
  } = useReaderConversation({
    book,
    conversationId,
    selectedQuote,
    getCurrentText,
    onClearSelectedText,
  });
  return (
    <div className="right-panel__body min-h-0 ai-panel [gap:6px]">
      <div
        ref={chatAreaRef}
        className={`semi-chat-area${userTurns.length ? ' semi-chat-area--with-turn-nav' : ''}`}
        aria-live="polite"
      >
        {userTurns.length > 0 && (
          <nav
            className="chat-turn-nav absolute [top:50%] [left:2px] [z-index:3] [max-height:calc(100%_-_24px)] [gap:2px] [padding:4px_0] [transform:translateY(-50%)] [scrollbar-width:none]"
            aria-label="用户消息快速导航"
          >
            {userTurns.map(({ message, messageIndex }, turnIndex) => {
              const preview =
                typeof message.content === 'string'
                  ? message.content.replace(/\s+/g, ' ').trim()
                  : `第 ${turnIndex + 1} 轮用户消息`;
              const tooltip = preview.length > 160 ? `${preview.slice(0, 160)}…` : preview;
              return (
                <Tooltip
                  key={message.id}
                  content={
                    <span className="chat-turn-nav__preview block [max-width:min(280px,_45vw)] [white-space:normal]">
                      {tooltip || `第 ${turnIndex + 1} 轮用户消息`}
                    </span>
                  }
                  position="right"
                >
                  <button
                    aria-label={`跳转到第 ${turnIndex + 1} 轮用户消息：${tooltip}`}
                    className="chat-turn-nav__item [width:22px] [height:18px] [flex:0_0_18px] [place-items:center] [padding:0] [background:transparent]"
                    type="button"
                    onClick={() => jumpToUserTurn(messageIndex)}
                  >
                    <span aria-hidden="true" />
                  </button>
                </Tooltip>
              );
            })}
          </nav>
        )}
        <AiConversationDialogue
          ImageComponent={BookResourceImage}
          chats={dialogueMessages}
          assistantName={providerLabel(provider ?? undefined, configs)}
          emptyTitle="开始新的对话"
          emptyDescription="Agent 会按需检索整本书、学习记录与联网资料"
          autoHideReasoning={aiPreferences.autoHideReasoning}
        />
      </div>

      <AIChatInput
        ref={inputRef}
        references={
          quote
            ? [
                {
                  id: 'reader-selection',
                  type: 'text',
                  content: `书中引用 · ${quote.chapter}：${quote.text}`,
                },
              ]
            : []
        }
        showReference
        onReferenceDelete={() => setQuote(null)}
        keepSkillAfterSend={false}
        placeholder={canSend ? '输入关于本书的问题…' : '添加并选择模型后开始提问'}
        canSend={canSend}
        generating={status === 'generating'}
        onMessageSend={({ inputContents }) =>
          void send(extractInputText(inputContents as Array<Record<string, unknown>>))
        }
        onStopGenerate={stop}
        showUploadButton={false}
        showTemplateButton={false}
        round
        renderTopSlot={() => (
          <div className="ai-composer-context min-w-0 [gap:4px] [margin-bottom:4px]">
            {visiblePromptTemplates.length > 0 && (
              <div
                className="ai-prompt-shortcuts min-w-0 [gap:6px] [padding-bottom:2px] overflow-x-auto [overscroll-behavior-inline:contain] [scrollbar-width:none] [touch-action:pan-x]"
                aria-label="AI 快捷提示词"
                role="group"
              >
                {visiblePromptTemplates.map((template) => (
                  <Button
                    aria-label={`发送提示词：${template.label}`}
                    disabled={
                      !canSend ||
                      ((template.id === 'book-knowledge-map' || template.id === 'infographic') &&
                        selectedConfig?.oauthProvider !== 'openai-codex')
                    }
                    title={
                      template.id === 'infographic'
                        ? '根据当前问题选择合适的图型，先整理内容稿与来源，再生成图片。也可在输入框指定图型和样式。'
                        : template.id === 'book-knowledge-map'
                          ? '分析全书已提取正文，生成包含主题、观点及其关系的知识地图。'
                          : undefined
                    }
                    key={template.id}
                    size="small"
                    theme="borderless"
                    type="tertiary"
                    onClick={() => void send(template.prompt)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            )}
            <div className="ai-composer-context__row min-w-0">
              <Tooltip
                content="Agent 可按需读取章节、搜索整本书，并在已配置时联网检索"
                position="topLeft"
              >
                <div
                  className="ai-book-context min-w-0 [min-height:22px] [gap:4px] [padding:2px_6px] [border-radius:9999px] [color:var(--semi-color-text-2)] [background:var(--semi-color-fill-0)]"
                  aria-label={`当前书籍《${book.title}》，已自动提供阅读工具`}
                >
                  <IconBookOpenStroked size="small" />
                  <Text size="small" ellipsis={{ showTooltip: true }}>
                    《{book.title}》 · {book.currentChapter || '当前章节'}
                  </Text>
                </div>
              </Tooltip>
            </div>
            {(statusMessage || status === 'unavailable') && (
              <Text
                size="small"
                type={status === 'error' ? 'danger' : 'tertiary'}
                className="ai-composer-message block"
              >
                {statusMessage || '请先到设置页添加 OpenAI 兼容模型。'}
              </Text>
            )}
          </div>
        )}
        renderConfigureArea={() => (
          <>
            <AiModelSelector
              configs={configs}
              provider={provider}
              model={model}
              disabled={status === 'generating'}
              onChange={chooseModel}
            />
            <AiReasoningEffortSelector
              config={selectedConfig}
              model={model}
              value={reasoningEffort}
              disabled={status === 'generating'}
              onChange={chooseReasoningEffort}
            />
          </>
        )}
        className="reader-ai-input"
      />
    </div>
  );
}

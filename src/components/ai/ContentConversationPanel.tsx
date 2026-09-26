import { useContentConversation } from '../../util/ai/useContentConversation';
import { AIChatInput, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconArticle, IconVideo } from '@douyinfe/semi-icons';
import { useLearningStore } from '../../util/state/useLearningStore';
import type { AiProvider, RssItem, VideoResource } from '../../util/types';
import {
  AiConversationDialogue,
  AiModelSelector,
  AiReasoningEffortSelector,
} from './AiConversationPrimitives';

const { Text } = Typography;

function extractInputText(inputContents?: Array<Record<string, unknown>>) {
  return (inputContents ?? [])
    .map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : ''))
    .join('')
    .trim();
}

function providerLabel(
  provider: AiProvider | undefined,
  configs: ReturnType<typeof useLearningStore.getState>['openAIConfigs'],
) {
  if (!provider) return 'AI';
  return configs.find((config) => provider === `api:${config.id}`)?.name ?? 'AI';
}

function LearningResourceAiPanel({
  resource,
  selectedText,
  onClearSelectedText,
}: {
  resource: { type: 'rss'; item: RssItem } | { type: 'video'; video: VideoResource };
  selectedText?: string;
  onClearSelectedText?: () => void;
}) {
  const {
    isVideo,
    resourceTitle,
    dialogueMessages,
    provider,
    configs,
    inputRef,
    quote,
    setQuote,
    canSend,
    status,
    send,
    stop,
    statusMessage,
    model,
    chooseModel,
    selectedConfig,
    reasoningEffort,
    chooseReasoningEffort,
  } = useContentConversation({ resource, selectedText, onClearSelectedText });
  return (
    <div className="right-panel__body min-h-0 ai-panel [gap:6px] rss-ai-panel min-w-0 min-h-0">
      <div className="semi-chat-area rss-ai-panel__dialogue min-h-0" aria-live="polite">
        <AiConversationDialogue
          chats={dialogueMessages}
          assistantName={providerLabel(provider ?? undefined, configs)}
          emptyTitle={isVideo ? '询问当前视频' : '询问当前内容'}
          emptyDescription={
            isVideo
              ? 'AI 可以读取字幕、结合时间点笔记总结和解释视频'
              : 'AI 可以读取正文、比较同一订阅源的近期内容，并按需联网核对'
          }
        />
      </div>
      <AIChatInput
        ref={inputRef}
        references={
          quote
            ? [
                {
                  id: 'rss-selection',
                  type: 'text',
                  content: `${isVideo ? '字幕引用' : '文章引用'} · ${resourceTitle}：${quote.text}`,
                },
              ]
            : []
        }
        showReference
        onReferenceDelete={() => setQuote(null)}
        keepSkillAfterSend={false}
        placeholder={isVideo ? '询问这个视频…' : '询问这篇内容…'}
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
            <div className="ai-composer-context__row min-w-0">
              <Tooltip
                content={
                  isVideo
                    ? 'AI 可读取当前视频字幕与时间点笔记'
                    : 'AI 可读取当前 RSS 正文与同一来源的近期内容'
                }
                position="topLeft"
              >
                <div
                  className="ai-book-context min-w-0 [min-height:22px] [gap:4px] [padding:2px_6px] [border-radius:9999px] [color:var(--semi-color-text-2)] [background:var(--semi-color-fill-0)]"
                  aria-label={`当前${isVideo ? '视频' : ' RSS 内容'}：${resourceTitle}`}
                >
                  {isVideo ? <IconVideo size="small" /> : <IconArticle size="small" />}
                  <Text size="small" ellipsis={{ showTooltip: true }}>
                    {resourceTitle}
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
        className="reader-ai-input rss-ai-input"
      />
    </div>
  );
}

export function RssAiPanel(props: {
  item: RssItem;
  selectedText?: string;
  onClearSelectedText?: () => void;
}) {
  return (
    <LearningResourceAiPanel
      resource={{ type: 'rss', item: props.item }}
      selectedText={props.selectedText}
      onClearSelectedText={props.onClearSelectedText}
    />
  );
}

export function VideoAiPanel(props: {
  video: VideoResource;
  selectedText?: string;
  onClearSelectedText?: () => void;
}) {
  return (
    <LearningResourceAiPanel
      resource={{ type: 'video', video: props.video }}
      selectedText={props.selectedText}
      onClearSelectedText={props.onClearSelectedText}
    />
  );
}

import { Agent } from '@earendil-works/pi-agent-core';
import type { UserMessage } from '@earendil-works/pi-ai';
import { generateBookKnowledgeMap } from './generation/knowledgeMap.js';
import { createInfographicTools, MAX_IMAGES_PER_REQUEST } from './generation/infographic.js';
import type { generateCodexImage } from './generation/codexImage.js';
import type { saveKnowledgeMap } from '../books/resources.js';
import { statusError } from '../../infrastructure/http/errors.js';
import { oauthService } from './oauth.js';
import { createOpenAICompatiblePiRuntime } from './runtime.js';
import type { PiRuntime } from './runtime.js';
import { createAgentTools, DEFAULT_NOTE_ACTIONS } from './tools.js';
import { piTool } from './toolDefinition.js';
import {
  streamEntriesToProgress,
  stringifyToolInput,
  errorMessage,
  agentSystemPrompt,
  requestMessageContent,
  toPiMessage,
} from './messages.js';
import type { StreamEntry } from './messages.js';
import type { AiChatContext, AiResult } from './jobs/types.js';
export { createOpenAICompatiblePiRuntime } from './runtime.js';

const MAX_AGENT_TURNS = 16;
const FINAL_TURN_INSTRUCTION =
  '这是最后一次模型请求：不得再调用工具，必须根据已有信息给出最终回答。';
type MapResult = Awaited<ReturnType<typeof generateBookKnowledgeMap>>;
interface ChatOptions extends AiChatContext {
  signal?: AbortSignal;
  onProgress?: (progress: AiResult) => void;
  onNoteChange?: (note: Awaited<ReturnType<typeof DEFAULT_NOTE_ACTIONS.createBookNote>>) => void;
  runtimeFactory?: (
    ...args: Parameters<typeof createOpenAICompatiblePiRuntime>
  ) => PiRuntime | Promise<PiRuntime>;
  oauth?: Pick<typeof oauthService, 'runtime'>;
  noteActions?: typeof DEFAULT_NOTE_ACTIONS;
  knowledgeMapGenerator?: typeof generateBookKnowledgeMap;
  infographicImageGenerator?: typeof generateCodexImage;
  infographicImageSave?: typeof saveKnowledgeMap;
}

export async function runServerAiChat({
  config,
  model,
  reasoningEffort,
  conversationId,
  messages,
  resourceType = 'book',
  purpose = 'chat',
  book,
  rssItem,
  rssFeed,
  translationSource,
  relatedRssItems = [],
  digestItems = [],
  digestFeeds = [],
  previousDigest,
  video,
  videoTimestampNotes = [],
  currentText,
  notes,
  highlights,
  readingSessions,
  webSearchConfig,
  assistantPrompt,
  signal,
  onProgress,
  onNoteChange,
  runtimeFactory = createOpenAICompatiblePiRuntime,
  oauth = oauthService,
  noteActions = DEFAULT_NOTE_ACTIONS,
  knowledgeMapGenerator = generateBookKnowledgeMap,
  infographicImageGenerator,
  infographicImageSave,
}: ChatOptions): Promise<AiResult> {
  const runtime = config.oauthProvider
    ? await oauth.runtime(config.oauthProvider, model, signal)
    : await runtimeFactory(config, model, reasoningEffort);
  const piModel = runtime.model;
  const trackedNoteActions = {
    readBookNotes: noteActions.readBookNotes,
    async createBookNote(...args: Parameters<typeof noteActions.createBookNote>) {
      const note = await noteActions.createBookNote(...args);
      onNoteChange?.(note);
      return note;
    },
    async updateBookNote(...args: Parameters<typeof noteActions.updateBookNote>) {
      const note = await noteActions.updateBookNote(...args);
      onNoteChange?.(note);
      return note;
    },
  };
  const requestMessages = messages.map((message) => ({
    role: message.role,
    content: requestMessageContent(message, resourceType, book, rssItem, video),
    createdAt: message.createdAt,
  }));
  let knowledgeMapRun: Promise<MapResult> | undefined;
  let imagesReserved = 0;
  let imageFailed = false;
  const reserveImage = () => {
    if (imageFailed) throw new Error('本次生图失败，请在下一条消息中重试。');
    if (imagesReserved >= MAX_IMAGES_PER_REQUEST)
      throw new Error(
        `每条消息最多生成 ${MAX_IMAGES_PER_REQUEST} 张图片，其余图片请在下一条消息生成。`,
      );
    imagesReserved += 1;
  };
  const knowledgeMapAction =
    config.oauthProvider === 'openai-codex'
      ? (toolSignal?: AbortSignal) => {
          if (!knowledgeMapRun) reserveImage();
          knowledgeMapRun ??= knowledgeMapGenerator({
            book: book!,
            runtime,
            signal: toolSignal,
            onStage: (stage) => {
              const entry = ensureEntry('tool', 'knowledge-map-stage', {
                name: '全景知识地图',
                arguments: '',
              });
              entry.arguments = stage;
              publish();
            },
          })
            .then((result) => {
              const entry = ensureEntry('message', 'knowledge-map-result');
              entry.status = 'completed';
              entry.text = `![全景知识地图](${result.imageUrl})\n\n[查看或保存原图](${result.imageUrl})\n\n${result.outline}\n\n已分析 ${result.passages} 个正文段落（${result.batches} 批）。${result.coverage}`;
              ensureEntry('tool', 'knowledge-map-stage').status = 'completed';
              publish();
              return result;
            })
            .catch((error) => {
              imageFailed = true;
              ensureEntry('tool', 'knowledge-map-stage').status = 'failed';
              publish();
              throw error;
            });
          return knowledgeMapRun;
        }
      : undefined;
  const infographicTools =
    config.oauthProvider === 'openai-codex' && resourceType === 'book'
      ? createInfographicTools({
          book: book!,
          runtime,
          reserveImage,
          generateImage: infographicImageGenerator,
          save: infographicImageSave,
          onPlan: (outline, planId) => {
            const entry = ensureEntry('message', `infographic-plan:${planId}`);
            entry.text = outline;
            entry.status = 'completed';
            publish();
          },
          onStage: (stage, status, planId) => {
            if (status === 'failed') imageFailed = true;
            const entry = ensureEntry('tool', `infographic-stage:${planId}`, {
              name: '信息图',
              arguments: '',
            });
            entry.arguments = stage;
            entry.status = status;
            publish();
          },
          onResult: (result, planId) => {
            const entry = ensureEntry('message', `infographic-result:${planId}`);
            entry.text = `![信息图](${result.imageUrl})\n\n[查看或保存原图](${result.imageUrl})\n\n图片中的文字与关系请对照原文核查。`;
            entry.status = 'completed';
            publish();
          },
        })
      : undefined;
  const toolMap = createAgentTools({
    resourceType,
    purpose,
    book,
    rssItem,
    rssFeed,
    translationSource,
    relatedRssItems,
    digestItems,
    digestFeeds,
    previousDigest,
    video,
    videoTimestampNotes,
    currentText,
    notes,
    highlights,
    readingSessions,
    webSearchConfig,
    noteActions: trackedNoteActions,
    knowledgeMapAction,
    infographicTools,
  });
  const tools = Object.entries(toolMap).map(([name, definition]) => piTool(name, definition));

  const entries: StreamEntry[] = [];
  const entryByKey = new Map<string, StreamEntry>();
  let step = -1;
  const publish = () => onProgress?.(streamEntriesToProgress(entries, 'in_progress'));
  const ensureEntry = (
    kind: StreamEntry['kind'],
    key: string,
    extra: Partial<StreamEntry> = {},
  ) => {
    let entry = entryByKey.get(key);
    if (!entry) {
      entry = { kind, key, text: '', status: 'in_progress', ...extra };
      entries.push(entry);
      entryByKey.set(key, entry);
    }
    return entry;
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: agentSystemPrompt(resourceType, purpose, assistantPrompt),
      model: piModel,
      thinkingLevel: reasoningEffort || 'off',
      tools,
      messages: requestMessages.slice(0, -1).map((message) => toPiMessage(message, piModel)),
    },
    getApiKey: () => (config.oauthProvider ? undefined : config.apiKey || undefined),
    sessionId: conversationId,
    maxRetryDelayMs: 30_000,
    toolExecution: 'parallel',
    streamFn: (activeModel, context, options) =>
      runtime.models.streamSimple(activeModel, context, {
        ...options,
        ...(reasoningEffort ? { reasoning: reasoningEffort } : {}),
        maxRetries: 1,
      }),
    shouldStopAfterTurn: ({ newMessages }) =>
      newMessages.filter((message) => message.role === 'assistant').length >= MAX_AGENT_TURNS,
    prepareNextTurnWithContext: ({ context, newMessages }) => {
      const completedTurns = newMessages.filter((message) => message.role === 'assistant').length;
      if (completedTurns !== MAX_AGENT_TURNS - 1) return undefined;
      return {
        context: {
          ...context,
          systemPrompt: `${context.systemPrompt}\n${FINAL_TURN_INSTRUCTION}`,
          tools: [],
        },
      };
    },
  });

  agent.subscribe((event) => {
    if (event.type === 'turn_start') {
      step += 1;
      return;
    }
    if (event.type === 'message_update') {
      const part = event.assistantMessageEvent;
      if (part.type === 'thinking_start') {
        ensureEntry('reasoning', `reasoning:${step}:${part.contentIndex}`);
      } else if (part.type === 'thinking_delta') {
        ensureEntry('reasoning', `reasoning:${step}:${part.contentIndex}`).text += part.delta;
        publish();
      } else if (part.type === 'thinking_end') {
        ensureEntry('reasoning', `reasoning:${step}:${part.contentIndex}`).status = 'completed';
        publish();
      } else if (part.type === 'text_start') {
        ensureEntry('message', `message:${step}:${part.contentIndex}`);
      } else if (part.type === 'text_delta') {
        ensureEntry('message', `message:${step}:${part.contentIndex}`).text += part.delta;
        publish();
      } else if (part.type === 'text_end') {
        ensureEntry('message', `message:${step}:${part.contentIndex}`).status = 'completed';
        publish();
      } else if (
        part.type === 'toolcall_start' ||
        part.type === 'toolcall_delta' ||
        part.type === 'toolcall_end'
      ) {
        const toolCall =
          event.message.role === 'assistant' ? event.message.content[part.contentIndex] : undefined;
        if (toolCall?.type === 'toolCall') {
          const entry = ensureEntry('tool', `tool:${toolCall.id}`, {
            name: toolCall.name,
            arguments: '',
          });
          entry.name = toolCall.name;
          entry.arguments = stringifyToolInput(toolCall.arguments);
          publish();
        }
      }
      return;
    }
    if (event.type === 'tool_execution_start') {
      const entry = ensureEntry('tool', `tool:${event.toolCallId}`, {
        name: event.toolName,
        arguments: '',
      });
      entry.name = event.toolName;
      entry.arguments = stringifyToolInput(event.args);
      publish();
      return;
    }
    if (event.type === 'tool_execution_end') {
      const entry = ensureEntry('tool', `tool:${event.toolCallId}`, {
        name: event.toolName,
        arguments: '',
      });
      entry.status = event.isError ? 'failed' : 'completed';
      publish();
    }
  });

  const abortAgent = () => agent.abort();
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
  signal?.addEventListener('abort', abortAgent, { once: true });
  try {
    const prompt = requestMessages.at(-1);
    if (!prompt || prompt.role !== 'user') throw new Error('AI 对话缺少用户消息');
    await agent.prompt(toPiMessage(prompt, piModel) as UserMessage);
  } catch (error) {
    // Do not retain SDK error causes: provider responses may contain OAuth tokens.
    if (config.oauthProvider && !signal?.aborted)
      throw statusError(502, 'OAuth 模型请求失败，请检查账号额度或在设置中重新登录');
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortAgent);
  }
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
  if (agent.state.errorMessage)
    throw new Error(
      config.oauthProvider
        ? 'OAuth 模型请求失败，请检查账号额度或在设置中重新登录'
        : errorMessage(agent.state.errorMessage),
    );

  const completed = streamEntriesToProgress(entries, 'completed');
  if (!completed.content) {
    completed.content = '接口返回了空内容。';
    completed.dialogueContent.push({
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: completed.content }],
    });
  }
  onProgress?.(completed);
  return completed;
}

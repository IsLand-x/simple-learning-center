import { findMindMapChapter } from '../mindmaps/model.js';
import { videoNarrationSchema } from '../chapterVideos/model.js';
import { speechUrl } from '../chapterVideos/media.js';
import { ttsSettings } from '../speech/settings.js';
import type { VideoNarrationContext } from '../chapterVideos/media.js';
import type { AiJob } from './types.js';
import type { NormalizedJobInput } from './startInput.js';
import { statusError } from '../../../infrastructure/http/errors.js';
import { readPersistedState } from '../../state/stateStore.js';
import { requiredString, normalizedMessage } from './model.js';

export async function prepareJobResources(input: NormalizedJobInput, jobs: Map<string, AiJob>) {
  const { request, purpose, configId, model, bookId, conversationId, userMessageId } = input;
  const persistedState = await readPersistedState({
    hydrateNote: (note) => note.bookId === bookId,
    hydrateCovers: false,
  });
  if (!persistedState?.state) throw statusError(409, '服务端尚未初始化');
  const state = persistedState.state;
  const config = (Array.isArray(state.openAIConfigs) ? state.openAIConfigs : []).find(
    (item) => item.id === configId,
  );
  if (!config) throw statusError(404, '找不到所选模型配置');
  if (!Array.isArray(config.models) || !config.models.includes(model)) {
    throw statusError(400, '所选模型不属于当前配置');
  }
  const book = (Array.isArray(state.books) ? state.books : []).find((item) => item.id === bookId);
  if (!book) throw statusError(404, '找不到当前书籍');
  const chapterId =
    purpose === 'mindmap' || (purpose === 'chapter-video' && request?.chapterId !== undefined)
      ? requiredString(request?.chapterId, '章节', 500)
      : undefined;
  if (chapterId && !findMindMapChapter(book.toc, chapterId))
    throw statusError(404, '章节不存在或不属于当前书籍');
  let videoNarration: VideoNarrationContext | undefined;
  if (purpose === 'chapter-video' && request?.videoNarration !== undefined) {
    const parsed = videoNarrationSchema.safeParse(request.videoNarration);
    if (!parsed.success) throw statusError(400, '配音配置不正确');
    if ('source' in parsed.data) {
      const speech = await ttsSettings.read();
      if (!speech) throw statusError(400, '请先在设置的 TTS 标签中保存语音配置');
      videoNarration = {
        tts: speech,
        model: speech.model,
        voice: speech.voice,
        config: {
          id: 'tts-settings',
          name: '阿里云百炼',
          baseUrl: '',
          apiKey: speech.apiKey,
          models: [],
          createdAt: 0,
          updatedAt: speech.updatedAt,
        },
      };
    } else {
      const { configId, model: speechModel, voice } = parsed.data;
      const speechConfig = state.openAIConfigs?.find((item) => item.id === configId);
      if (!speechConfig || speechConfig.oauthProvider || !speechConfig.apiKey?.trim())
        throw statusError(400, '请选择有 API Key 的配音供应商，登录授权不能用于语音接口');
      speechUrl(speechConfig.baseUrl);
      videoNarration = {
        config: structuredClone(speechConfig),
        model: speechModel,
        voice,
      };
    }
  }
  const termId = purpose === 'glossary' ? requiredString(request?.termId, '术语', 200) : undefined;
  const term = termId
    ? (state.highlights ?? []).find(
        (item) => item.id === termId && item.bookId === bookId && item.kind === 'term',
      )
    : undefined;
  if (termId && !term) throw statusError(404, '术语已删除或不属于当前书籍');
  if (
    termId &&
    [...jobs.values()].some(
      (job) => job.termId === termId && ['queued', 'running'].includes(job.status),
    )
  ) {
    throw statusError(409, '该术语正在生成释义');
  }
  const existingChats = (Array.isArray(state.chats) ? state.chats : [])
    .filter(
      (message) =>
        message.bookId === bookId &&
        message.conversationId === conversationId &&
        message.id !== userMessageId &&
        (message.role === 'user' || message.role === 'assistant'),
    )
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-40)
    .map(normalizedMessage);
  return { state, config, book, chapterId, videoNarration, termId, term, existingChats };
}

export type PreparedJobResources = Awaited<ReturnType<typeof prepareJobResources>>;
